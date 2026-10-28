#!/usr/bin/env node
/* eslint-env node */
/**
 * Purge arena soak feedback rows (ARENAFB#*) from DynamoDB.
 *
 *   node scripts/purge-arena-feedback.mjs [--stage dev|prod] [--dry-run] [--user-id <cognitoSub>]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const PK_PREFIX = 'ARENAFB#';
const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};
const BATCH_WRITE_SIZE = 25;

function usage() {
  console.error(`Usage: node scripts/purge-arena-feedback.mjs [--stage dev|prod] [--dry-run] [--user-id <sub>]`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let userId;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) stage = argv[++i];
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--user-id' && argv[i + 1]) userId = argv[++i];
    else if (arg === '--help' || arg === '-h') usage();
    else usage();
  }
  if (!STAGES[stage]) usage();
  return { stage, dryRun, userId };
}

async function queryPartition(docClient, tableName, pk) {
  const items = [];
  let lastKey;
  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function scanPartitions(docClient, tableName) {
  const keys = new Set();
  let lastKey;
  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(#pk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':prefix': PK_PREFIX },
      ProjectionExpression: '#pk',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of page.Items ?? []) {
      if (item.pk) keys.add(item.pk);
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return [...keys];
}

async function batchDelete(docClient, tableName, keys, dryRun) {
  if (dryRun || keys.length === 0) return keys.length;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += BATCH_WRITE_SIZE) {
    const chunk = keys.slice(i, i + BATCH_WRITE_SIZE);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
      },
    }));
    deleted += chunk.length;
  }
  return deleted;
}

async function main() {
  const { stage, dryRun, userId } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  const partitions = userId ? [`${PK_PREFIX}${userId}`] : await scanPartitions(docClient, table);
  const keys = [];
  for (const pk of partitions) {
    for (const row of await queryPartition(docClient, table, pk)) {
      keys.push({ pk: row.pk, sk: row.sk });
    }
  }

  console.log(`Stage ${stage}: ${keys.length} ARENAFB# item(s)${dryRun ? ' (dry run)' : ''}`);
  const deleted = await batchDelete(docClient, table, keys, dryRun);
  console.log(dryRun ? `Would delete ${deleted}` : `Deleted ${deleted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
