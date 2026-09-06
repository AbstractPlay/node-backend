#!/usr/bin/env node
/* eslint-env node */
/**
 * Purge legacy named-palette records from DynamoDB.
 *
 * Deletes pk=PALETTES items (old per-user named palette library). Does NOT touch
 * CUSTOMIZATION# (Customize / paintbrush palettes) or USER settings.
 *
 * Legacy settings.color on USER records is stripped by the API on read/write;
 * no USER-table scan is required.
 *
 * Usage:
 *   node bin/purge-legacy-palettes.mjs [--stage dev|prod] [--dry-run] [--user-id <cognitoSub>]
 *
 * Examples:
 *   node bin/purge-legacy-palettes.mjs --stage dev --dry-run
 *   node bin/purge-legacy-palettes.mjs --stage prod
 *   node bin/purge-legacy-palettes.mjs --stage dev --user-id <cognitoSub>
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
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

const BATCH_WRITE_SIZE = 25;
const BATCH_RETRY_MS = 200;

function usage() {
  console.error(`Usage: node bin/purge-legacy-palettes.mjs [options]

Options:
  --stage dev|prod          AWS profile + DynamoDB table (default: dev)
  --dry-run                 Count actions only; do not write
  --user-id <cognitoSub>    Delete one user's PALETTES item only
  --help, -h                Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let userId;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
    } else if (arg === '--stage') {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--user-id') {
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

async function queryPalettePartition(docClient, tableName) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'PALETTES' },
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

async function main() {
  const { stage, dryRun, userId } = parseArgs(process.argv.slice(2));
  const { profile, table: tableName } = STAGES[stage];

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

  console.log(`Stage: ${stage} (${tableName})${dryRun ? ' [dry-run]' : ''}`);
  console.log(`Profile: ${profile}`);

  let keys;
  if (userId) {
    keys = [{ pk: 'PALETTES', sk: userId }];
    console.log(`Targeting single user: ${userId}`);
  } else {
    const rows = await queryPalettePartition(docClient, tableName);
    keys = rows.map(row => ({ pk: row.pk, sk: row.sk }));
    console.log(`Found ${keys.length} PALETTES record(s)`);
  }

  if (userId && !dryRun && keys.length === 1) {
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: keys[0],
    }));
    console.log('Deleted 1 PALETTES record');
    return;
  }

  const deleted = await batchDeleteKeys(docClient, tableName, keys, dryRun);
  console.log(dryRun ? `Would delete ${deleted} PALETTES record(s)` : `Deleted ${deleted} PALETTES record(s)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
