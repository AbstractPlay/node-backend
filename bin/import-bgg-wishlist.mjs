#!/usr/bin/env node
/**
 * Import BGG wishlist XML into the feedback DynamoDB table.
 *
 * Usage:
 *   npm run import-bgg-wishlist -- --stage dev --input path/to/thumbs.xml --dry-run
 *   npx tsx bin/import-bgg-wishlist.mjs --stage dev --input path/to/thumbs.xml --dry-run
 *
 * Requires tsx (devDependency) to load lib/*.ts sources. Plain `node` will not work.
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildWishlistListRowsFromMeta,
  buildWishlistMetaFromBggImport,
  parseBggWishlistXml,
} from '../lib/feedback/bggImport.js';
import { kindGsi1Pk, listSortPrefix } from '../lib/feedback/keys.js';

function parseArgs(argv) {
  const args = { dryRun: true, stage: '', input: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--live') {
      args.dryRun = false;
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    }
  }
  return args;
}

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_TABLE_PROD ?? 'abstract-play-feedback-prod';
  }
  return process.env.FEEDBACK_TABLE ?? 'abstract-play-feedback-dev';
}

async function existingLegacyIds(client, tableName) {
  const ids = new Set();
  let lastKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'ByKind',
      KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': kindGsi1Pk('wishlist'),
        ':prefix': listSortPrefix('votes'),
      },
      ProjectionExpression: 'legacyBggItemId',
      ExclusiveStartKey: lastKey,
      Limit: 200,
    }));
    for (const item of result.Items ?? []) {
      if (item.legacyBggItemId) {
        ids.add(String(item.legacyBggItemId));
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage || !args.input) {
    console.error('Usage: npm run import-bgg-wishlist -- --stage dev|prod --input path/to/thumbs.xml [--dry-run|--live]');
    process.exit(1);
  }

  const xml = readFileSync(args.input, 'utf8');
  const items = parseBggWishlistXml(xml);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const existing = args.dryRun ? new Set() : await existingLegacyIds(client, tableName);
  const toImport = items.filter((item) => !existing.has(item.legacyBggItemId));

  console.log(`Parsed ${items.length} items; ${toImport.length} to import (${items.length - toImport.length} skipped as existing).`);
  if (args.dryRun) {
    const totalLegacyVotes = toImport.reduce((sum, item) => sum + item.legacyVoteCount, 0);
    console.log(`Dry run: would import ${toImport.length} items with ${totalLegacyVotes} aggregate legacy votes.`);
    return;
  }

  let created = 0;
  for (const item of toImport) {
    const meta = buildWishlistMetaFromBggImport(item);
    const listRows = buildWishlistListRowsFromMeta(meta);
    await client.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tableName, Item: meta } },
        ...listRows.map((row) => ({ Put: { TableName: tableName, Item: row } })),
      ],
    }));
    created += 1;
  }
  console.log(`Imported ${created} wishlist items into ${tableName}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
