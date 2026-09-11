#!/usr/bin/env node
/**
 * Report BGG wishlist submitters and match against AP usernames.
 *
 * Usage:
 *   npm run report-bgg-wishlist-users -- --input ../gameslib/bin/thumbs.xml [--stage dev|prod]
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  BGG_IMPORT_AUTHOR_ID,
  buildApUsernameIndexFromRows,
  parseBggWishlistXml,
  resolveBggSubmitter,
} from '../lib/feedback/bggImport.js';

function parseArgs(argv) {
  const args = { input: '', stage: 'prod', emitMap: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--emit-map' && argv[i + 1]) {
      args.emitMap = argv[++i];
    }
  }
  return args;
}

function tableNameForStage(stage) {
  if (stage === 'dev') {
    return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
  }
  return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
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

function matchBggUsername(bggName, resolver) {
  const author = resolveBggSubmitter(bggName, resolver);
  if (author.authorId === BGG_IMPORT_AUTHOR_ID) {
    const candidates = resolver.apUsers?.lowerToEntries.get(bggName.toLowerCase()) ?? [];
    if (candidates.length > 1) {
      return {
        status: 'ambiguous',
        candidates: candidates.map((c) => c.name),
      };
    }
    return { status: 'unmatched' };
  }
  return {
    status: 'matched',
    apUserId: author.authorId,
    apName: author.authorName,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('Usage: npm run report-bgg-wishlist-users -- --input path/to/thumbs.xml [--stage dev|prod]');
    process.exit(1);
  }

  const xml = readFileSync(args.input, 'utf8');
  const items = parseBggWishlistXml(xml);
  const bySubmitter = new Map();
  for (const item of items) {
    const name = item.legacyBggSubmitter?.trim() || '(unknown)';
    const entry = bySubmitter.get(name) ?? { itemCount: 0, titles: [] };
    entry.itemCount += 1;
    if (entry.titles.length < 5) {
      entry.titles.push(item.title);
    }
    bySubmitter.set(name, entry);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const tableName = tableNameForStage(args.stage);
  const apUsers = await loadApUsers(client, tableName);
  const resolver = { userMap: {}, apUsers: apUsers.index, displayNameByUserId: apUsers.displayNameByUserId };

  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  for (const [bggName, data] of [...bySubmitter.entries()].sort((a, b) => b[1].itemCount - a[1].itemCount)) {
    const result = matchBggUsername(bggName, resolver);
    const row = { bggName, ...data, ...result };
    if (result.status === 'matched') {
      matched.push(row);
    } else if (result.status === 'ambiguous') {
      ambiguous.push(row);
    } else {
      unmatched.push(row);
    }
  }

  const matchedItems = matched.reduce((sum, row) => sum + row.itemCount, 0);
  const ambiguousItems = ambiguous.reduce((sum, row) => sum + row.itemCount, 0);
  const unmatchedItems = unmatched.reduce((sum, row) => sum + row.itemCount, 0);

  console.log(`BGG wishlist user report (${args.stage}, table ${tableName})`);
  console.log(`Items: ${items.length}; unique BGG submitters: ${bySubmitter.size}`);
  console.log(`Auto-matched: ${matched.length} users (${matchedItems} items)`);
  console.log(`Ambiguous: ${ambiguous.length} users (${ambiguousItems} items)`);
  console.log(`Need lookup: ${unmatched.length} users (${unmatchedItems} items)`);
  console.log('');

  if (matched.length > 0) {
    console.log('=== Auto-matched ===');
    for (const row of matched) {
      console.log(`${row.bggName} -> ${row.apName} (${row.apUserId}) [${row.itemCount} items]`);
    }
    console.log('');
  }

  if (ambiguous.length > 0) {
    console.log('=== Ambiguous (manual pick) ===');
    for (const row of ambiguous) {
      console.log(`${row.bggName} [${row.itemCount} items] -> ${row.candidates.join(' | ')}`);
      console.log(`  e.g. ${row.titles.join('; ')}`);
    }
    console.log('');
  }

  if (unmatched.length > 0) {
    console.log('=== Need lookup ===');
    for (const row of unmatched) {
      console.log(`${row.bggName} [${row.itemCount} items] — e.g. ${row.titles.join('; ')}`);
    }
    console.log('');
    console.log('Add entries to bin/bgg-ap-user-map.json (BGG username -> AP user UUID).');
  }

  if (args.emitMap) {
    const { writeFileSync } = await import('node:fs');
    const starter = {};
    for (const row of unmatched) {
      if (row.bggName !== '(unknown)') {
        starter[row.bggName] = '';
      }
    }
    writeFileSync(args.emitMap, `${JSON.stringify(starter, null, 2)}\n`, 'utf8');
    console.log(`Wrote starter map for ${Object.keys(starter).length} unmatched users to ${args.emitMap}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
