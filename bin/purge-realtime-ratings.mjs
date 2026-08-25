#!/usr/bin/env node
/* eslint-env node */
/**
 * Purge legacy realtime Elo ratings from DynamoDB (batch Glicko migration Phase 4d).
 *
 * Removes data that is no longer written after realtime ratings were excised:
 *   - RATINGS#<metaGame> leaderboard rows (pk/sk index items)
 *   - USER.ratings map on profile records
 *
 * Does NOT touch METAGAMES# ratingsCount (served from _summary-ratings.json on recount).
 * Does NOT remove ratingChange NOTIFICATION# rows (historical in-app notifications).
 *
 * Usage:
 *   node bin/purge-realtime-ratings.mjs [--stage dev|prod] [--dry-run]
 *     --step purge-ratings-index|strip-user-ratings|all
 *     [--meta-game <metaGameUid>] [--user-id <cognitoSub>]
 *
 * Examples:
 *   node bin/purge-realtime-ratings.mjs --stage prod --dry-run --step all
 *   node bin/purge-realtime-ratings.mjs --stage prod --step purge-ratings-index --meta-game chess
 *   node bin/purge-realtime-ratings.mjs --stage prod --step strip-user-ratings --user-id <cognitoSub>
 *
 * After a full purge, run admin authQuery `update_meta_game_counts` so METAGAMES# ratingsCount
 * matches _summary-ratings.json (not updated by this script).
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
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

const STEPS = [
  'purge-ratings-index',
  'strip-user-ratings',
  'all',
];

const BATCH_WRITE_SIZE = 25;
const BATCH_RETRY_MS = 200;

function usage() {
  console.error(`Usage: node bin/purge-realtime-ratings.mjs [options]

Options:
  --stage dev|prod                    AWS profile + DynamoDB table (default: dev)
  --dry-run                           Count actions only; do not write
  --step purge-ratings-index|strip-user-ratings|all   Required
  --purge-ratings-index               Shorthand for --step purge-ratings-index
  --strip-user-ratings                Shorthand for --step strip-user-ratings
  --all                               Shorthand for --step all
  --meta-game <metaGameUid>           Limit RATINGS# partition or one USER.ratings key
  --user-id <cognitoSub>              Single user (strip-user-ratings only)
  --help, -h                          Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let step;
  let metaGame;
  let userId;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--step' && argv[i + 1]) {
      step = argv[++i];
    } else if (arg === '--meta-game' && argv[i + 1]) {
      metaGame = argv[++i];
    } else if (arg === '--user-id' && argv[i + 1]) {
      userId = argv[++i];
    } else if (arg === '--purge-ratings-index') {
      step = 'purge-ratings-index';
    } else if (arg === '--strip-user-ratings') {
      step = 'strip-user-ratings';
    } else if (arg === '--all') {
      step = 'all';
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
  if (userId && step === 'purge-ratings-index') {
    console.error('--user-id applies only to strip-user-ratings');
    usage();
  }

  return { stage, dryRun, step, metaGame, userId };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      ProjectionExpression: '#pk, #sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function scanRatingsIndexRows(docClient, tableName, metaGame) {
  if (metaGame) {
    return await queryPartition(docClient, tableName, `RATINGS#${metaGame}`);
  }

  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(#pk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':prefix': 'RATINGS#' },
      ProjectionExpression: '#pk, #sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (items.length > 0 && items.length % 1000 === 0) {
      process.stdout.write(`\r  scanned RATINGS# rows: ${items.length}`);
    }
  } while (lastEvaluatedKey);

  if (items.length >= 1000) {
    process.stdout.write('\n');
  }

  return items;
}

async function batchDeleteKeys(docClient, tableName, keys, dryRun, stats) {
  if (keys.length === 0) {
    return;
  }
  if (dryRun) {
    stats.ratingsIndexDeleted = (stats.ratingsIndexDeleted ?? 0) + keys.length;
    return;
  }

  let deleted = 0;
  for (let i = 0; i < keys.length; i += BATCH_WRITE_SIZE) {
    let pending = keys.slice(i, i + BATCH_WRITE_SIZE);

    while (pending.length > 0) {
      const result = await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: pending.map(key => ({ DeleteRequest: { Key: key } })),
        },
      }));

      const unprocessed = result.UnprocessedItems?.[tableName] ?? [];
      deleted += pending.length - unprocessed.length;
      pending = unprocessed.map(req => req.DeleteRequest.Key);
      if (pending.length > 0) {
        await sleep(BATCH_RETRY_MS);
      }
    }
  }

  stats.ratingsIndexDeleted = (stats.ratingsIndexDeleted ?? 0) + deleted;
}

async function purgeRatingsIndex(docClient, tableName, { dryRun, metaGame }) {
  const stats = { partitions: 0 };

  console.log('\nPurging RATINGS#<metaGame> leaderboard rows…');
  if (metaGame) {
    console.log(`  meta game: ${metaGame}`);
  }

  const rows = await scanRatingsIndexRows(docClient, tableName, metaGame);
  const partitionSet = new Set(rows.map(row => row.pk));
  stats.partitions = partitionSet.size;
  stats.ratingsIndexRows = rows.length;
  console.log(`  found ${rows.length} rows across ${partitionSet.size} partition(s)`);

  const keys = rows.map(row => ({ pk: row.pk, sk: row.sk }));
  await batchDeleteKeys(docClient, tableName, keys, dryRun, stats);

  return stats;
}

async function getUserRecord(docClient, tableName, userId) {
  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk, ratings',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
  }));
  return data.Item;
}

async function scanUserIdsWithRatings(docClient, tableName) {
  const userIds = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk AND attribute_exists(ratings)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'USER' },
      ProjectionExpression: '#pk, #sk, ratings',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      if (item.sk) {
        userIds.push({
          userId: item.sk,
          ratings: item.ratings,
        });
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (userIds.length > 0 && userIds.length % 500 === 0) {
      process.stdout.write(`\r  scanned USER ratings: ${userIds.length}`);
    }
  } while (lastEvaluatedKey);

  if (userIds.length >= 500) {
    process.stdout.write('\n');
  }

  return userIds;
}

function shouldStripUserRatings(ratings, metaGame) {
  if (!ratings || typeof ratings !== 'object') {
    return false;
  }
  if (!metaGame) {
    return true;
  }
  return Object.prototype.hasOwnProperty.call(ratings, metaGame);
}

async function stripRatingsForUser(docClient, tableName, userId, ratings, { dryRun, metaGame }, stats) {
  if (!shouldStripUserRatings(ratings, metaGame)) {
    return;
  }

  if (dryRun) {
    stats.userRatingsStripped = (stats.userRatingsStripped ?? 0) + 1;
    return;
  }

  if (metaGame) {
    const remainingKeys = Object.keys(ratings).filter(key => key !== metaGame);
    if (remainingKeys.length === 0) {
      await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        UpdateExpression: 'REMOVE ratings',
      }));
    } else {
      await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        UpdateExpression: 'REMOVE ratings.#mg',
        ExpressionAttributeNames: { '#mg': metaGame },
      }));
    }
  } else {
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      UpdateExpression: 'REMOVE ratings',
    }));
  }

  stats.userRatingsStripped = (stats.userRatingsStripped ?? 0) + 1;
}

async function stripUserRatings(docClient, tableName, { dryRun, metaGame, userId }) {
  const stats = { usersScanned: 0 };

  console.log('\nRemoving USER.ratings from profile records…');
  if (metaGame) {
    console.log(`  meta game key: ${metaGame}`);
  }

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.usersScanned = 1;
    await stripRatingsForUser(docClient, tableName, userId, user.ratings, { dryRun, metaGame }, stats);
    return stats;
  }

  const users = await scanUserIdsWithRatings(docClient, tableName);
  stats.usersScanned = users.length;
  console.log(`  found ${users.length} USER records with ratings`);

  for (const { userId: id, ratings } of users) {
    await stripRatingsForUser(docClient, tableName, id, ratings, { dryRun, metaGame }, stats);
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
  const { stage, dryRun, step, metaGame, userId } = parseArgs(process.argv);
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
  if (metaGame) {
    console.log(`Meta game: ${metaGame}`);
  }
  if (userId) {
    console.log(`User id: ${userId}`);
  }

  const runIndex = step === 'purge-ratings-index' || step === 'all';
  const runUsers = step === 'strip-user-ratings' || step === 'all';

  if (runIndex) {
    const stats = await purgeRatingsIndex(docClient, table, { dryRun, metaGame });
    printStats('RATINGS# purge', stats);
  }

  if (runUsers) {
    const stats = await stripUserRatings(docClient, table, { dryRun, metaGame, userId });
    printStats('USER.ratings strip', stats);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
