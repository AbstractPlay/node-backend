#!/usr/bin/env node
/* eslint-env node */
/**
 * Post-Phase 5 dashboard index maintenance (admin ops).
 *
 * Steps (index-only; does not read USER.games[]):
 *   prune-stale-recent-completed — Delete RECENTCOMPLETED# rows not dashboard-eligible (USERGAME# overlays)
 *   purge-usergame-orphans       — Delete USERGAME# rows for games not on CURRENTGAMES# / RECENTCOMPLETED#
 *   remove-legacy-games          — REMOVE games + gamesUpdate from USER records (run once after Phase 5 deploy)
 *
 * Meta game counts: use admin authQuery `update_meta_game_counts` (live recount to METAGAMES#), not this script.
 *
 * Usage:
 *   node bin/backfill-normalization-phase2.mjs [--stage dev|prod] [--dry-run]
 *     --step prune-stale-recent-completed|purge-usergame-orphans|remove-legacy-games [--user-id <cognitoSub>]
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
  UpdateCommand,
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

const COMPLETED_DASHBOARD_RETENTION_MS = 7 * 24 * 3600000;

const STEPS = [
  'prune-stale-recent-completed',
  'purge-usergame-orphans',
  'remove-legacy-games',
];

function usage() {
  console.error(`Usage: node bin/backfill-normalization-phase2.mjs [options]

Options:
  --stage dev|prod                    AWS profile + DynamoDB table (default: dev)
  --dry-run                           Count actions only; do not write
  --step ${STEPS.join('|')}   Required
  --prune-stale-recent-completed      Shorthand for --step prune-stale-recent-completed
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
    } else if (arg === '--prune-stale-recent-completed') {
      step = 'prune-stale-recent-completed';
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

function isActiveDashboardGame(game) {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

function shouldBeOnCompletedDashboard(game, now = Date.now()) {
  if (isActiveDashboardGame(game)) {
    return false;
  }
  if (game.seen === undefined) {
    return true;
  }
  if ((game.lastChat || 0) > game.seen) {
    return true;
  }
  return now - game.seen <= COMPLETED_DASHBOARD_RETENTION_MS;
}

function recentCompletedRowToGame(row) {
  return {
    id: row.id ?? row.sk,
    metaGame: row.metaGame,
    toMove: row.toMove ?? '',
    lastMoveTime: row.lastMoveTime,
    seen: row.seen,
    lastChat: row.lastChat,
  };
}

function completedGameForEligibility(row, overlayById) {
  const base = recentCompletedRowToGame(row);
  const overlay = overlayById.get(row.sk);
  const result = { ...base };
  const seen = overlay?.seen ?? base.seen;
  const lastChat = overlay?.lastChat ?? base.lastChat;
  if (seen !== undefined) {
    result.seen = seen;
  } else {
    delete result.seen;
  }
  if (lastChat !== undefined) {
    result.lastChat = lastChat;
  } else {
    delete result.lastChat;
  }
  return result;
}

async function getUserRecord(docClient, tableName, userId) {
  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk, games, gamesUpdate',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
  }));
  return data.Item;
}

async function scanAllUsers(docClient, tableName) {
  const users = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'USER' },
      ProjectionExpression: '#pk, #sk, games, gamesUpdate',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      users.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (users.length > 0 && users.length % 500 === 0) {
      process.stdout.write(`\r  scanned users: ${users.length}`);
    }
  } while (lastEvaluatedKey);

  if (users.length >= 500) {
    process.stdout.write('\n');
  }

  return users;
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

function dashboardGameIds(currentGameRows, recentCompletedRows) {
  const ids = new Set();
  for (const row of currentGameRows) {
    if (row.sk) {
      ids.add(row.sk);
    }
  }
  for (const row of recentCompletedRows) {
    if (row.sk) {
      ids.add(row.sk);
    }
  }
  return ids;
}

async function pruneStaleRecentCompletedForUser(docClient, tableName, userId, dryRun, stats) {
  const recentCompletedRows = await queryPartition(docClient, tableName, `RECENTCOMPLETED#${userId}`);
  const userGameRows = await queryUserGameRows(docClient, tableName, userId);
  const overlayById = new Map(userGameRows.map(row => [row.sk, row]));
  const now = Date.now();

  for (const row of recentCompletedRows) {
    const merged = completedGameForEligibility(row, overlayById);
    if (shouldBeOnCompletedDashboard(merged, now)) {
      continue;
    }
    if (dryRun) {
      stats.recentCompletedPruned = (stats.recentCompletedPruned ?? 0) + 1;
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: row.pk, sk: row.sk },
    }));
    stats.recentCompletedPruned = (stats.recentCompletedPruned ?? 0) + 1;
  }
}

async function pruneStaleRecentCompleted(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nPruning stale RECENTCOMPLETED# rows (not dashboard-eligible with USERGAME# overlays)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await pruneStaleRecentCompletedForUser(docClient, tableName, userId, dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await pruneStaleRecentCompletedForUser(docClient, tableName, user.sk, dryRun, stats);
  }

  return stats;
}

async function purgeUserGameOrphansForUser(docClient, tableName, userId, dryRun, stats) {
  const currentRows = await queryPartition(docClient, tableName, `CURRENTGAMES#${userId}`);
  const recentCompletedRows = await queryPartition(docClient, tableName, `RECENTCOMPLETED#${userId}`);
  const onDashboard = dashboardGameIds(currentRows, recentCompletedRows);
  const userGameRows = await queryUserGameRows(docClient, tableName, userId);

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

  console.log('\nPurging USERGAME# rows not on user dashboard (CURRENTGAMES# + RECENTCOMPLETED#)…');

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

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await purgeUserGameOrphansForUser(docClient, tableName, user.sk, dryRun, stats);
  }

  return stats;
}

async function removeLegacyGamesForUser(docClient, tableName, userId, dryRun, stats) {
  const user = await getUserRecord(docClient, tableName, userId);
  if (!user) {
    return;
  }
  if (user.games === undefined && user.gamesUpdate === undefined) {
    stats.alreadyRemoved = (stats.alreadyRemoved ?? 0) + 1;
    return;
  }
  if (dryRun) {
    stats.removed = (stats.removed ?? 0) + 1;
    return;
  }
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    UpdateExpression: 'REMOVE games, gamesUpdate',
  }));
  stats.removed = (stats.removed ?? 0) + 1;
}

async function removeLegacyGames(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nRemoving legacy USER.games[] and gamesUpdate fields…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await removeLegacyGamesForUser(docClient, tableName, userId, dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await removeLegacyGamesForUser(docClient, tableName, user.sk, dryRun, stats);
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

  if (step === 'prune-stale-recent-completed') {
    const stats = await pruneStaleRecentCompleted(docClient, table, { dryRun, userId });
    printStats('RECENTCOMPLETED prune', stats);
  }

  if (step === 'purge-usergame-orphans') {
    const stats = await purgeUserGameOrphans(docClient, table, { dryRun, userId });
    printStats('USERGAME orphan purge', stats);
  }

  if (step === 'remove-legacy-games') {
    const stats = await removeLegacyGames(docClient, table, { dryRun, userId });
    printStats('Legacy games field removal', stats);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
