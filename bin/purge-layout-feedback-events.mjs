#!/usr/bin/env node
/* eslint-env node */
/**
 * Purge preview-era Game Move layout feedback events from DynamoDB.
 *
 * Deletes all items whose pk begins with LAYOUTFB# (one partition per user).
 * Preview analytics (`log_layout_feedback_event`, layout-feedback-analytics cron)
 * were removed in permanent-layouts Phase 3; S3 rollups under
 * gamemove-layout/analytics/ are kept as an archive.
 *
 * Usage:
 *   node bin/purge-layout-feedback-events.mjs [--stage dev|prod] [--dry-run]
 *     [--user-id <cognitoSub>]
 *
 * Examples:
 *   node bin/purge-layout-feedback-events.mjs --stage dev --dry-run
 *   node bin/purge-layout-feedback-events.mjs --stage prod
 *   node bin/purge-layout-feedback-events.mjs --stage dev --user-id <cognitoSub>
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const LAYOUT_FB_PK_PREFIX = 'LAYOUTFB#';

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

const BATCH_WRITE_SIZE = 25;
const BATCH_RETRY_MS = 200;

function usage() {
  console.error(`Usage: node bin/purge-layout-feedback-events.mjs [options]

Options:
  --stage dev|prod          AWS profile + DynamoDB table (default: dev)
  --dry-run                 Count actions only; do not write
  --user-id <cognitoSub>    Delete one user's LAYOUTFB# partition only
  --help, -h                Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let userId;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
    } else if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--user-id' && argv[i + 1]) {
      userId = argv[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!STAGES[stage]) {
    console.error(`Invalid --stage: ${stage}`);
    usage();
  }

  return { stage, dryRun, userId };
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
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
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

async function scanLayoutFeedbackPartitions(docClient, tableName) {
  const partitionKeys = new Set();
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(#pk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':prefix': LAYOUT_FB_PK_PREFIX },
      ProjectionExpression: '#pk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      if (item.pk) {
        partitionKeys.add(item.pk);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (partitionKeys.size > 0 && partitionKeys.size % 500 === 0) {
      process.stdout.write(`\r  scanned LAYOUTFB# partitions: ${partitionKeys.size}`);
    }
  } while (lastEvaluatedKey);

  if (partitionKeys.size >= 500) {
    process.stdout.write('\n');
  }

  return [...partitionKeys];
}

async function batchDeleteKeys(docClient, tableName, keys, dryRun) {
  if (keys.length === 0) {
    return 0;
  }
  if (dryRun) {
    return keys.length;
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

  return deleted;
}

async function purgeLayoutFeedbackEvents(docClient, tableName, { dryRun, userId }) {
  const stats = {
    partitions: 0,
    items: 0,
    deleted: 0,
  };

  console.log('\nPurging LAYOUTFB# layout feedback events…');

  const partitionKeys = userId
    ? [`${LAYOUT_FB_PK_PREFIX}${userId}`]
    : await scanLayoutFeedbackPartitions(docClient, tableName);

  stats.partitions = partitionKeys.length;
  console.log(`  found ${partitionKeys.length} partition(s)`);

  const keys = [];
  for (const pk of partitionKeys) {
    const rows = await queryPartition(docClient, tableName, pk);
    for (const row of rows) {
      keys.push({ pk: row.pk, sk: row.sk });
    }
  }

  stats.items = keys.length;
  console.log(`  found ${keys.length} item(s)`);

  stats.deleted = await batchDeleteKeys(docClient, tableName, keys, dryRun);
  return stats;
}

function printStats(stats) {
  console.log('\nLAYOUTFB# purge:');
  for (const [key, value] of Object.entries(stats).sort()) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  const { stage, dryRun, userId } = parseArgs(process.argv);
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
  if (userId) {
    console.log(`User id: ${userId}`);
  }

  const stats = await purgeLayoutFeedbackEvents(docClient, table, { dryRun, userId });
  printStats(stats);
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
