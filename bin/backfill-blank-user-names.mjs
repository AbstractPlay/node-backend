#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill blank human display names in USER and USERS records.
 *
 * For each USERS row with a missing/whitespace name:
 *   1. If USER.name is non-empty after trim, copy it to USERS.name
 *   2. Otherwise set both USER.name and USERS.name to Player-{first8OfUserId}
 *
 * Usage:
 *   node bin/backfill-blank-user-names.mjs --stage dev --dry-run
 *   node bin/backfill-blank-user-names.mjs --stage prod --apply
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  isBlankDisplayName,
  placeholderUserDisplayName,
  validateUserDisplayName,
} from '../lib/userDisplayName.js';

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
  console.error(`Usage: node bin/backfill-blank-user-names.mjs --stage dev|prod [--dry-run|--apply]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --dry-run          Print planned changes without writing (default)
  --apply            Apply updates to DynamoDB
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      apply = false;
    } else if (arg === '--apply') {
      apply = true;
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

  return { stage, apply };
}

async function queryPartition(docClient, tableName, pk) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#name': 'name' },
      ExpressionAttributeValues: { ':pk': pk },
      ProjectionExpression: 'sk, #name',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

function resolveTargetName(userId, userName) {
  const userValidated = validateUserDisplayName(userName);
  if (userValidated.ok) {
    return {
      name: userValidated.name,
      source: 'USER',
      usersOnly: true,
    };
  }

  const placeholder = placeholderUserDisplayName(userId);
  return {
    name: placeholder,
    source: 'placeholder',
    usersOnly: false,
  };
}

async function applyNameUpdate(docClient, tableName, userId, target) {
  const updates = [];

  if (!target.usersOnly) {
    updates.push(docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: { ':name': target.name },
      UpdateExpression: 'SET #name = :name',
    })));
  }

  updates.push(docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: 'USERS', sk: userId },
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: { ':name': target.name },
    UpdateExpression: 'SET #name = :name',
  })));

  await Promise.all(updates);
}

async function main() {
  const { stage, apply } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }), {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);

  const usersRows = await queryPartition(docClient, table, 'USERS');
  const blankRows = usersRows.filter(row => isBlankDisplayName(row.name));

  if (blankRows.length === 0) {
    console.log('No blank USERS.name rows found.');
    return;
  }

  console.log(`Found ${blankRows.length} USERS row(s) with blank names.`);

  let updated = 0;
  for (const row of blankRows) {
    const userId = row.sk;
    const userData = await docClient.send(new GetCommand({
      TableName: table,
      Key: { pk: 'USER', sk: userId },
      ProjectionExpression: '#name',
      ExpressionAttributeNames: { '#name': 'name' },
    }));

    const target = resolveTargetName(userId, userData.Item?.name);
    const oldUsersName = typeof row.name === 'string' ? JSON.stringify(row.name) : String(row.name);
    const oldUserName = typeof userData.Item?.name === 'string'
      ? JSON.stringify(userData.Item.name)
      : String(userData.Item?.name);

    console.log(
      `${userId}: USERS.name=${oldUsersName}, USER.name=${oldUserName} -> "${target.name}" (${target.source}, ${target.usersOnly ? 'USERS only' : 'USER+USERS'})`,
    );

    if (apply) {
      await applyNameUpdate(docClient, table, userId, target);
      updated += 1;
    }
  }

  if (apply) {
    console.log(`Applied ${updated} update(s).`);
  } else {
    console.log('Dry run complete. Re-run with --apply to write changes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
