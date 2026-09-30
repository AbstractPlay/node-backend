#!/usr/bin/env node
/**
 * Backfill USER# POST# submitted-index rows for Discord-imported posts with mapped authors.
 *
 * Usage:
 *   npm run backfill-feedback-discord-user-index -- --stage dev
 *   npm run backfill-feedback-discord-user-index -- --stage prod --live
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  buildDiscordSubmittedUserIndexRow,
  DISCORD_IMPORT_AUTHOR_ID,
} from '../lib/feedback/discordImport.js';
import { kindGsi1Pk, listSortPrefix, metaSk, postPk } from '../lib/feedback/keys.js';

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_TABLE_PROD ?? 'abstract-play-feedback-prod';
  }
  return process.env.FEEDBACK_TABLE ?? 'abstract-play-feedback-dev';
}

function parseArgs(argv) {
  const args = { stage: 'dev', dryRun: true, live: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (argv[i] === '--dry-run') {
      args.dryRun = true;
      args.live = false;
    } else if (argv[i] === '--live') {
      args.live = true;
      args.dryRun = false;
    }
  }
  return args;
}

function postIdFromPk(pk) {
  return String(pk).replace(/^POST#/, '');
}

async function listPostIds(client, tableName) {
  const ids = [];
  for (const kind of ['bug', 'feature']) {
    let exclusiveStartKey;
    do {
      const result = await client.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'ByKind',
        KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': kindGsi1Pk(kind),
          ':prefix': listSortPrefix('votes'),
        },
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
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: postPk(postId), sk: metaSk() },
  }));
  return result.Item;
}

async function userIndexExists(client, tableName, row) {
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: row.pk, sk: row.sk },
  }));
  return Boolean(result.Item);
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(`Table: ${tableName} dryRun: ${args.dryRun}`);

  const postIds = await listPostIds(client, tableName);
  console.log(`Posts to scan: ${postIds.length}`);

  const puts = [];
  let discordMapped = 0;
  let alreadyIndexed = 0;
  let skippedUnmapped = 0;
  let skippedNotDiscord = 0;

  for (const postId of postIds) {
    const meta = await loadMeta(client, tableName, postId);
    if (!meta) {
      continue;
    }
    if (!meta.legacyDiscordThreadId) {
      skippedNotDiscord += 1;
      continue;
    }
    const authorId = String(meta.authorId);
    if (authorId === DISCORD_IMPORT_AUTHOR_ID) {
      skippedUnmapped += 1;
      continue;
    }
    discordMapped += 1;
    const indexRow = buildDiscordSubmittedUserIndexRow(meta);
    if (!indexRow) {
      continue;
    }
    if (await userIndexExists(client, tableName, indexRow)) {
      alreadyIndexed += 1;
      continue;
    }
    puts.push(indexRow);
  }

  console.log(`Discord posts with mapped authors: ${discordMapped}`);
  console.log(`  skipped (not Discord import): ${skippedNotDiscord}`);
  console.log(`  skipped (unmapped author): ${skippedUnmapped}`);
  console.log(`  already have submitted index: ${alreadyIndexed}`);
  console.log(`  index rows to write: ${puts.length}`);

  if (args.dryRun) {
    if (puts.length > 0) {
      console.log('Sample rows:');
      for (const row of puts.slice(0, 5)) {
        console.log(`  ${row.pk} ${row.sk}`);
      }
    }
    console.log('Re-run with --live to write.');
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
