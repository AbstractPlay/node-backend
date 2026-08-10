#!/usr/bin/env node
/* eslint-env node */
/**
 * Delete legacy PLAYGROUND rows (one-time maintenance).
 *
 * Retired partition (no longer written):
 *   pk = PLAYGROUND
 *   sk = <userid>
 *
 * Usage:
 *   node bin/purge-playground.mjs [--stage dev|prod|all] [--dry-run]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
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

function usage() {
  console.error(`Usage: node bin/purge-playground.mjs [options]

Options:
  --stage dev|prod|all   AWS profile + DynamoDB table (default: all)
  --dry-run              Count rows only; do not delete
  --help, -h             Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'all';
  let dryRun = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (stage !== 'all' && !STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }

  return { stage, dryRun };
}

function createDocClient(profile) {
  const client = new DynamoDBClient({
    region: 'us-east-1',
    profile,
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });
}

async function queryPlaygroundKeys(docClient, tableName) {
  const keys = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'PLAYGROUND' },
      ProjectionExpression: '#pk, #sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      keys.push({ pk: item.pk, sk: item.sk });
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return keys;
}

async function batchDelete(docClient, tableName, keys) {
  let deleted = 0;

  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map(key => ({
          DeleteRequest: { Key: key },
        })),
      },
    }));
    deleted += chunk.length;
    if (deleted % 500 === 0 || deleted === keys.length) {
      process.stdout.write(`\r  deleted: ${deleted}/${keys.length}`);
    }
  }

  if (keys.length >= 500) {
    process.stdout.write('\n');
  }

  return deleted;
}

async function purgeStage(stageName, dryRun) {
  const { profile, table } = STAGES[stageName];
  const docClient = createDocClient(profile);

  console.log(`\n=== ${stageName} ===`);
  console.log(`Table: ${table}`);
  console.log(`Profile: ${profile}`);
  console.log(`Dry run: ${dryRun}`);

  console.log('\nQuerying pk=PLAYGROUND…');
  const keys = await queryPlaygroundKeys(docClient, table);
  console.log(`  found ${keys.length} rows`);

  if (keys.length === 0) {
    console.log('Nothing to delete.');
    return 0;
  }

  if (dryRun) {
    console.log(`Dry run — would delete ${keys.length} PLAYGROUND rows.`);
    return keys.length;
  }

  console.log('\nDeleting…');
  const deleted = await batchDelete(docClient, table, keys);
  console.log(`Deleted ${deleted} PLAYGROUND rows.`);
  return deleted;
}

async function main() {
  const { stage, dryRun } = parseArgs(process.argv);
  const stages = stage === 'all' ? ['dev', 'prod'] : [stage];
  const totals = {};

  for (const stageName of stages) {
    totals[stageName] = await purgeStage(stageName, dryRun);
  }

  if (stages.length > 1) {
    const total = Object.values(totals).reduce((sum, count) => sum + count, 0);
    console.log('\n=== Summary ===');
    for (const [stageName, count] of Object.entries(totals)) {
      const label = dryRun ? 'would delete' : 'deleted';
      console.log(`  ${stageName}: ${count} ${label}`);
    }
    const label = dryRun ? 'would delete' : 'deleted';
    console.log(`  total: ${total} ${label}`);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
