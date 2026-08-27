#!/usr/bin/env node
/* eslint-env node */
/**
 * Dashboard index maintenance (admin ops).
 *
 * Steps (index-only; does not read USER.games[]):
 *   purge-all-recent-completed — Delete every legacy RECENTCOMPLETED# row (should be empty after Phase 4)
 *   purge-usergame-orphans     — Delete USERGAME# rows not on CURRENTGAMES#
 *
 * Meta game counts: use admin authQuery `update_meta_game_counts` (live recount to METAGAMES#), not this script.
 *
 * Usage:
 *   node bin/dashboard-index-maintenance.mjs [--stage dev|prod] [--dry-run]
 *     --step purge-all-recent-completed|purge-usergame-orphans [--user-id <cognitoSub>]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    table: 'abstract-play-dev',
  },
  prod: {
    profile: 'AbstractPlayProd',
    table: 'abstract-play-prod',
  },
};

const STEPS = [
  'purge-all-recent-completed',
  'purge-usergame-orphans',
];

function usage() {
  console.error(`Usage: node bin/dashboard-index-maintenance.mjs [options]

Options:
  --stage dev|prod                    AWS profile + DynamoDB table (default: dev)
  --dry-run                           Count actions only; do not write
  --step ${STEPS.join('|')}   Required
  --purge-all-recent-completed        Shorthand for --step purge-all-recent-completed
  --purge-usergame-orphans            Shorthand for --step purge-usergame-orphans
  --user-id <cognitoSub>              Single user (all steps)
  --help, -h                          Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let step;
  let userId;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--step' && argv[i + 1]) {
      step = argv[++i];
    } else if (arg === '--user-id' && argv[i + 1]) {
      userId = argv[++i];
    } else if (arg === '--purge-all-recent-completed') {
      step = 'purge-all-recent-completed';
    } else if (arg === '--purge-usergame-orphans') {
      step = 'purge-usergame-orphans';
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }
  if (!step) {
    console.error('--step is required');
    usage();
  }
  if (!STEPS.includes(step)) {
    console.error(`Unknown step: ${step}`);
    usage();
  }

  return { stage, dryRun, step, userId };
}

async function getUserRecord(docClient, tableName, userId) {
  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
  }));
  return data.Item;
}

async function scanAllUserIds(docClient, tableName) {
  const userIds = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'USER' },
      ProjectionExpression: '#pk, #sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      if (item.sk) {
        userIds.push(item.sk);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (userIds.length > 0 && userIds.length % 500 === 0) {
      process.stdout.write(`\r  scanned users: ${userIds.length}`);
    }
  } while (lastEvaluatedKey);

  if (userIds.length >= 500) {
    process.stdout.write('\n');
  }

  return userIds;
}

async function queryUserGameRows(docClient, tableName, userId) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `USERGAME#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function queryPartition(docClient, tableName, pk) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function purgeAllRecentCompletedForUser(docClient, tableName, userId, dryRun, stats) {
  const recentCompletedRows = await queryPartition(docClient, tableName, `RECENTCOMPLETED#${userId}`);

  for (const row of recentCompletedRows) {
    if (dryRun) {
      stats.recentCompletedDeleted = (stats.recentCompletedDeleted ?? 0) + 1;
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: row.pk, sk: row.sk },
    }));
    stats.recentCompletedDeleted = (stats.recentCompletedDeleted ?? 0) + 1;
  }
}

async function purgeAllRecentCompleted(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nDeleting all RECENTCOMPLETED# rows (legacy completed-dashboard index)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await purgeAllRecentCompletedForUser(docClient, tableName, userId, dryRun, stats);
    return stats;
  }

  const userIds = await scanAllUserIds(docClient, tableName);
  stats.users = userIds.length;
  console.log(`  found ${userIds.length} USER records`);

  for (const id of userIds) {
    await purgeAllRecentCompletedForUser(docClient, tableName, id, dryRun, stats);
  }

  return stats;
}

async function purgeUserGameOrphansForUser(docClient, tableName, userId, dryRun, stats) {
  const currentRows = await queryPartition(docClient, tableName, `CURRENTGAMES#${userId}`);
  const userGameRows = await queryUserGameRows(docClient, tableName, userId);
  const onDashboard = new Set(currentRows.map(row => row.sk).filter(Boolean));

  for (const row of userGameRows) {
    if (onDashboard.has(row.sk)) {
      continue;
    }
    if (dryRun) {
      stats.userGamesDeleted = (stats.userGamesDeleted ?? 0) + 1;
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: row.pk, sk: row.sk },
    }));
    stats.userGamesDeleted = (stats.userGamesDeleted ?? 0) + 1;
  }
}

async function purgeUserGameOrphans(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nPurging USERGAME# rows not on CURRENTGAMES#…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await purgeUserGameOrphansForUser(docClient, tableName, userId, dryRun, stats);
    return stats;
  }

  const userIds = await scanAllUserIds(docClient, tableName);
  stats.users = userIds.length;
  console.log(`  found ${userIds.length} USER records`);

  for (const id of userIds) {
    await purgeUserGameOrphansForUser(docClient, tableName, id, dryRun, stats);
  }

  return stats;
}

function printStats(label, stats) {
  console.log(`\n${label}:`);
  for (const [key, value] of Object.entries(stats).sort()) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  const { stage, dryRun, step, userId } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const client = new DynamoDBClient({
    region: 'us-east-1',
    profile,
  });
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Profile: ${profile}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Step: ${step}`);
  if (userId) {
    console.log(`User id: ${userId}`);
  }

  if (step === 'purge-all-recent-completed') {
    const stats = await purgeAllRecentCompleted(docClient, table, { dryRun, userId });
    printStats('RECENTCOMPLETED purge-all', stats);
  }

  if (step === 'purge-usergame-orphans') {
    const stats = await purgeUserGameOrphans(docClient, table, { dryRun, userId });
    printStats('USERGAME orphan purge', stats);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
