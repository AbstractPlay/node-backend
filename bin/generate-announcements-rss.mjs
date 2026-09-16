#!/usr/bin/env node
/**
 * Write news.rss from published announcements in DynamoDB.
 *
 * Usage:
 *   npm run generate-announcements-rss -- --stage dev --out ../front/public/news.rss
 */
import { writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { announcementsList, buildAnnouncementsRss } from '../lib/announcements/index.js';

function parseArgs(argv) {
  const args = { stage: '', out: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    }
  }
  return args;
}

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

async function fetchAllPublished(client, tableName) {
  const items = [];
  let cursor;
  do {
    const result = await announcementsList(client, tableName, { limit: 100, cursor });
    if (!result.ok) {
      throw new Error(result.message);
    }
    items.push(...result.data.items);
    cursor = result.data.nextCursor;
  } while (cursor);
  return items;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage || !args.out) {
    console.error('Usage: npm run generate-announcements-rss -- --stage dev|prod --out path/to/news.rss');
    process.exit(1);
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const tableName = tableNameForStage(args.stage);
  const items = await fetchAllPublished(client, tableName);
  const xml = buildAnnouncementsRss(items);
  writeFileSync(args.out, xml, 'utf8');
  console.log(`Wrote ${items.length} items to ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
