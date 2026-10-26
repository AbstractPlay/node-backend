#!/usr/bin/env node
/**
 * Backfill USER# voted/watched index rows from POST# VOTE# and SUB# children.
 *
 * Usage:
 *   npm run backfill-feedback-user-engagement -- --stage dev
 *   npm run backfill-feedback-user-engagement -- --stage dev --dry-run
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_TABLE_PROD ?? 'abstract-play-feedback-prod';
  }
  return process.env.FEEDBACK_TABLE ?? 'abstract-play-feedback-dev';
}

function parseArgs(argv) {
  const args = { stage: 'dev', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

function postIdFromPk(pk) {
  return String(pk).replace(/^POST#/, '');
}

async function listPostIds(client, tableName) {
  const ids = [];
  let exclusiveStartKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'ByKind',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': 'KIND#bug' },
      ProjectionExpression: 'pk',
      ExclusiveStartKey: exclusiveStartKey,
    }));
    for (const item of result.Items ?? []) {
      ids.push(postIdFromPk(item.pk));
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  for (const kind of ['feature', 'wishlist']) {
    exclusiveStartKey = undefined;
    do {
      const result = await client.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'ByKind',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': `KIND#${kind}` },
        ProjectionExpression: 'pk',
        ExclusiveStartKey: exclusiveStartKey,
      }));
      for (const item of result.Items ?? []) {
        ids.push(postIdFromPk(item.pk));
      }
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);
  }
  return [...new Set(ids)];
}

async function loadMeta(client, tableName, postId) {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: {
      ':pk': `POST#${postId}`,
      ':sk': 'META',
    },
  }));
  return result.Items?.[0];
}

async function loadEngagementChildren(client, tableName, postId) {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `POST#${postId}` },
  }));
  return result.Items ?? [];
}

function userVotedSk(kind, createdAt, id) {
  return `VOTED#${kind}#${createdAt}#${id}`;
}

function userWatchSk(kind, createdAt, id) {
  return `WATCH#${kind}#${createdAt}#${id}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(`Table: ${tableName} dryRun: ${args.dryRun}`);

  const postIds = await listPostIds(client, tableName);
  console.log(`Posts to scan: ${postIds.length}`);

  const puts = [];
  for (const postId of postIds) {
    const meta = await loadMeta(client, tableName, postId);
    if (!meta) {
      continue;
    }
    const kind = meta.kind;
    const createdAt = Number(meta.createdAt);
    const children = await loadEngagementChildren(client, tableName, postId);
    for (const child of children) {
      const sk = String(child.sk);
      if (sk.startsWith('VOTE#')) {
        const userId = String(child.userId ?? sk.replace(/^VOTE#/, ''));
        puts.push({
          pk: `USER#${userId}`,
          sk: userVotedSk(kind, createdAt, postId),
          entityType: 'userVotedIndex',
          id: postId,
          kind,
          createdAt,
        });
      } else if (sk.startsWith('SUB#')) {
        const userId = String(child.userId ?? sk.replace(/^SUB#/, ''));
        puts.push({
          pk: `USER#${userId}`,
          sk: userWatchSk(kind, createdAt, postId),
          entityType: 'userWatchIndex',
          id: postId,
          kind,
          createdAt,
        });
      }
    }
  }

  console.log(`Index rows to write: ${puts.length}`);
  if (args.dryRun) {
    return;
  }

  for (let i = 0; i < puts.length; i += 25) {
    const batch = puts.slice(i, i + 25);
    await client.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: batch.map((Item) => ({ PutRequest: { Item } })),
      },
    }));
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
