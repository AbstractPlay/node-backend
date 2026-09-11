#!/usr/bin/env node
/**
 * Backfill wishlist cover images from BGG for live items with a BGG link and no image.
 *
 * Usage:
 *   BGG_API_TOKEN=... npm run backfill-wishlist-bgg-images -- --stage dev --dry-run
 *   npm run backfill-wishlist-bgg-images -- --stage prod --token-file path/to/bgg-token.txt --live --limit 25
 *
 * BGG requests are rate-limited (default 5s between thing lookups).
 * Token is the same BGG application Bearer token used in gameslib/bin/fetchThumbs.ts.
 */
import { readFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { fetchBggRepresentativeImageUrl } from '../lib/feedback/bggImage.js';
import { putPostAttachmentFromUrl } from '../lib/feedback/attachments.js';
import { setFeedbackPostAttachmentKeys } from '../lib/feedback/access.js';
import { parseBggGameId } from '../lib/feedback/ids.js';
import { kindGsi1Pk, listSortPrefix } from '../lib/feedback/keys.js';

const DEFAULT_DELAY_MS = 5000;

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_TABLE_PROD ?? 'abstract-play-feedback-prod';
  }
  return process.env.FEEDBACK_TABLE ?? 'abstract-play-feedback-dev';
}

function bucketForStage(stage) {
  if (stage === 'prod') {
    return process.env.FEEDBACK_ATTACHMENTS_BUCKET_PROD ?? 'ap-feedback-attachments-prod';
  }
  return process.env.FEEDBACK_ATTACHMENTS_BUCKET ?? 'ap-feedback-attachments-dev';
}

function loadBggToken(tokenFile) {
  if (process.env.BGG_API_TOKEN?.trim()) {
    return process.env.BGG_API_TOKEN.trim();
  }
  if (tokenFile) {
    return readFileSync(tokenFile, 'utf8').trim();
  }
  throw new Error('BGG API token required: set BGG_API_TOKEN or pass --token-file');
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    stage: '',
    limit: 0,
    delayMs: DEFAULT_DELAY_MS,
    tokenFile: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--live') {
      args.dryRun = false;
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    } else if (arg === '--delay-ms' && argv[i + 1]) {
      args.delayMs = Number(argv[++i]);
    } else if (arg === '--token-file' && argv[i + 1]) {
      args.tokenFile = argv[++i];
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasAttachmentKeys(item) {
  return Array.isArray(item.attachmentKeys) && item.attachmentKeys.length > 0;
}

function resolveBggGameId(item) {
  if (typeof item.bggGameId === 'string' && item.bggGameId.trim()) {
    return item.bggGameId.trim();
  }
  if (typeof item.gameUrl === 'string') {
    return parseBggGameId(item.gameUrl);
  }
  return undefined;
}

async function listWishlistRows(client, tableName) {
  const byId = new Map();
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
      ProjectionExpression: 'id, title, gameUrl, bggGameId, attachmentKeys, terminalAt',
      ExclusiveStartKey: lastKey,
      Limit: 200,
    }));
    for (const item of result.Items ?? []) {
      const id = String(item.id ?? '');
      if (!id || byId.has(id)) {
        continue;
      }
      byId.set(id, item);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return [...byId.values()];
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.stage) {
    console.error('Usage: npm run backfill-wishlist-bgg-images -- --stage dev|prod [--live] [--limit N] [--delay-ms 5000] [--token-file path]');
    console.error('Dry-run is the default; pass --live to write images and update DynamoDB.');
    console.error('BGG token: set BGG_API_TOKEN or pass --token-file (same token as gameslib/bin/fetchThumbs.ts).');
    process.exit(1);
  }

  process.env.BGG_API_TOKEN = loadBggToken(args.tokenFile);
  process.env.FEEDBACK_ATTACHMENTS_BUCKET = bucketForStage(args.stage);
  const tableName = tableNameForStage(args.stage);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const s3 = new S3Client({});

  const rows = await listWishlistRows(client, tableName);
  const candidates = rows.filter((item) => (
    !hasAttachmentKeys(item)
    && resolveBggGameId(item)
  ));
  const toProcess = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;

  if (args.dryRun) {
    console.log('*** DRY RUN — no BGG downloads or DynamoDB writes. Pass --live to backfill. ***');
  }
  console.log(`Stage: ${args.stage}`);
  console.log(`Table: ${tableName}`);
  console.log(`Wishlist rows: ${rows.length}`);
  console.log(`Candidates (BGG link, no image): ${candidates.length}`);
  console.log(`Processing this run: ${toProcess.length}`);

  const summary = {
    processed: 0,
    uploaded: 0,
    skippedNoImage: 0,
    failed: 0,
  };

  for (const item of toProcess) {
    summary.processed += 1;
    const postId = String(item.id);
    const bggGameId = resolveBggGameId(item);
    const label = `${postId} (${item.title ?? 'untitled'}, BGG ${bggGameId})`;
    try {
      if (summary.processed > 1 && args.delayMs > 0) {
        await sleep(args.delayMs);
      }
      const imageUrl = await fetchBggRepresentativeImageUrl(bggGameId);
      if (!imageUrl) {
        summary.skippedNoImage += 1;
        console.log(`skip (no BGG image): ${label}`);
        continue;
      }
      if (args.dryRun) {
        summary.uploaded += 1;
        console.log(`would upload: ${label} <- ${imageUrl}`);
        continue;
      }
      const key = await putPostAttachmentFromUrl(s3, postId, imageUrl);
      const update = await setFeedbackPostAttachmentKeys(client, tableName, postId, [key], s3);
      if (!update.ok) {
        throw new Error(update.message);
      }
      summary.uploaded += 1;
      console.log(`uploaded: ${label} -> ${key}`);
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed: ${label} — ${message}`);
    }
  }

  console.log('Summary:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
