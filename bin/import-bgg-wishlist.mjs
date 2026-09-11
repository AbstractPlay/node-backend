#!/usr/bin/env node
/**
 * Import BGG wishlist XML into the feedback DynamoDB table.
 *
 * Usage:
 *   npm run import-bgg-wishlist -- --stage prod --input path/to/thumbs.xml --map bin/bgg-ap-user-map.json --live
 *   npm run import-bgg-wishlist -- --stage dev --input path/to/thumbs.xml --dry-run
 *
 * Dry-run is the default (no DynamoDB writes). Pass --live to import.
 *
 * User map format (BGG @username -> AP user UUID):
 *   { "Striton": "uuid-here", "Kalabas07": "uuid-here" }
 * See bin/bgg-ap-user-map.example.json. Unmapped submitters fall back to the BGG Import system author.
 * AP username auto-match (case-insensitive) is also applied when --stage is set.
 * Mapped/auto-matched authors get an auto-vote and auto-subscribe (no notifications).
 * BGG submitter "Striton" is excluded from auto-vote/subscribe.
 *
 * Requires tsx (devDependency) to load lib/*.ts sources. Plain `node` will not work.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildApUsernameIndexFromRows,
  buildBggImportAuthorEngagementRows,
  buildWishlistListRowsFromMeta,
  buildWishlistMetaFromBggImport,
  parseBggWishlistXml,
  resolveBggSubmitter,
  shouldBggImportAutoEngageAuthor,
  BGG_IMPORT_AUTHOR_ID,
} from '../lib/feedback/bggImport.js';
import { kindGsi1Pk, listSortPrefix } from '../lib/feedback/keys.js';

const DEFAULT_MAP = join(dirname(fileURLToPath(import.meta.url)), 'bgg-ap-user-map.json');

function parseArgs(argv) {
  const args = { dryRun: true, stage: '', input: '', mapFile: DEFAULT_MAP };
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
    } else if (arg === '--map' && argv[i + 1]) {
      args.mapFile = argv[++i];
    } else if (arg === '--no-map') {
      args.mapFile = '';
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

function apTableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

function loadUserMap(mapFile) {
  if (!mapFile || !existsSync(mapFile)) {
    return {};
  }
  const raw = JSON.parse(readFileSync(mapFile, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`User map must be a JSON object: ${mapFile}`);
  }
  const userMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim()) {
      userMap[key] = value.trim();
    }
  }
  return userMap;
}

async function loadApUsers(client, tableName) {
  const rows = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'USERS' },
      ProjectionExpression: 'sk, #name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const id = String(item.sk);
      if (name) {
        rows.push({ id, name });
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  const index = buildApUsernameIndexFromRows(rows);
  const displayNameByUserId = {};
  for (const row of rows) {
    displayNameByUserId[row.id] = row.name;
  }
  return { index, displayNameByUserId };
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

function summarizeAuthors(items, resolver) {
  const counts = { mapped: 0, autoMatched: 0, fallback: 0 };
  for (const item of items) {
    const author = resolveBggSubmitter(item.legacyBggSubmitter, resolver);
    const bggName = item.legacyBggSubmitter?.trim();
    if (!bggName) {
      counts.fallback += 1;
      continue;
    }
    const mappedId = Object.entries(resolver.userMap).find(
      ([key]) => key === bggName || key.toLowerCase() === bggName.toLowerCase(),
    )?.[1];
    if (mappedId && author.authorId === mappedId) {
      counts.mapped += 1;
    } else if (author.authorId !== BGG_IMPORT_AUTHOR_ID) {
      counts.autoMatched += 1;
    } else {
      counts.fallback += 1;
    }
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage || !args.input) {
    console.error('Usage: npm run import-bgg-wishlist -- --stage dev|prod --input path/to/thumbs.xml [--map bin/bgg-ap-user-map.json] [--no-map] [--live]');
    console.error('Dry-run is the default; pass --live to write to DynamoDB.');
    process.exit(1);
  }

  const xml = readFileSync(args.input, 'utf8');
  const items = parseBggWishlistXml(xml);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const userMap = loadUserMap(args.mapFile);
  const apUsers = await loadApUsers(client, apTableNameForStage(args.stage));
  const resolver = {
    userMap,
    apUsers: apUsers.index,
    displayNameByUserId: apUsers.displayNameByUserId,
  };

  const existing = args.dryRun ? new Set() : await existingLegacyIds(client, tableName);
  const toImport = items.filter((item) => !existing.has(item.legacyBggItemId));
  const authorCounts = summarizeAuthors(toImport, resolver);
  const autoEngageCount = toImport.filter((item) => {
    const author = resolveBggSubmitter(item.legacyBggSubmitter, resolver);
    return shouldBggImportAutoEngageAuthor(item.legacyBggSubmitter, author.authorId);
  }).length;

  if (args.dryRun) {
    console.log('*** DRY RUN — no data written. Pass --live to import. ***');
  } else {
    console.log(`*** LIVE import into ${tableName} ***`);
  }

  console.log(`Parsed ${items.length} items; ${toImport.length} to import (${items.length - toImport.length} skipped as existing).`);
  if (args.mapFile) {
    console.log(`User map: ${args.mapFile} (${Object.keys(userMap).length} entries)`);
  }
  console.log(`Authors: ${authorCounts.mapped} from map, ${authorCounts.autoMatched} auto-matched, ${authorCounts.fallback} BGG Import fallback.`);
  console.log(`Auto-vote/subscribe: ${autoEngageCount} items (Striton excluded).`);

  if (args.dryRun) {
    const totalLegacyVotes = toImport.reduce((sum, item) => sum + item.legacyVoteCount, 0);
    console.log(`Would import ${toImport.length} items with ${totalLegacyVotes} aggregate legacy votes.`);
    console.log('Re-run with --live to write.');
    return;
  }

  let created = 0;
  for (const item of toImport) {
    const meta = buildWishlistMetaFromBggImport(item, undefined, resolver);
    const listRows = buildWishlistListRowsFromMeta(meta);
    const engagementRows = buildBggImportAuthorEngagementRows(meta, item, resolver);
    await client.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tableName, Item: meta } },
        ...listRows.map((row) => ({ Put: { TableName: tableName, Item: row } })),
        ...engagementRows.map((row) => ({ Put: { TableName: tableName, Item: row } })),
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
