#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill in-app completedGameChat notifications for unread post-game chat.
 *
 * Eligibility per RECENTCOMPLETED# row (merged with USERGAME# overlay):
 *   (lastChat || 0) > (seen || 0)  — same rule as Completed Games "newChat" highlight
 *
 * Skips bots, skips when an active completedGameChat notification already exists.
 * Uses generic backfill message (body.backfill = true).
 *
 * Usage:
 *   npm run build-ts
 *   node bin/backfill-completed-game-chat-notifications.mjs [--stage dev|prod] [--dry-run] [--user-id <cognitoSub>]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const LIB_ROOT = path.join(__dirname, '..', 'lib');
const NOTIFICATIONS_LIB = path.join(LIB_ROOT, 'notifications.js');

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
  console.error(`Usage: node bin/backfill-completed-game-chat-notifications.mjs [options]

Options:
  --stage dev|prod       AWS profile + DynamoDB table (default: dev)
  --dry-run              Count eligible rows only; do not write
  --user-id <cognitoSub> Single user (default: all USER records)
  --help, -h             Show this help

Prerequisites:
  npm run build-ts       (compiles lib/*.ts to lib/*.js)
`);
  process.exit(1);
}

function ensureCompiledLib() {
  if (!existsSync(NOTIFICATIONS_LIB)) {
    console.error(`Missing compiled lib file: notifications.js`);
    console.error('Run: npm run build-ts');
    process.exit(1);
  }
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let userId;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--user-id' && argv[i + 1]) {
      userId = argv[++i];
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

  return { stage, dryRun, userId };
}

function hasUnreadCompletedGameChat(seen, lastChat) {
  return (lastChat || 0) > (seen || 0);
}

function overlayForGame(userGameRows, gameId) {
  const row = userGameRows.find(r => r.sk === gameId);
  if (!row) {
    return {};
  }
  const overlay = {};
  if (row.seen !== undefined) {
    overlay.seen = row.seen;
  }
  if (row.lastChat !== undefined) {
    overlay.lastChat = row.lastChat;
  }
  return overlay;
}

async function isBotId(docClient, tableName, id) {
  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'BOT', sk: id },
    ProjectionExpression: '#pk, #sk',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
  }));
  return data.Item !== undefined;
}

async function getUserRecord(docClient, tableName, userId) {
  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
  }));
  return data.Item;
}

async function scanAllUserIds(docClient, tableName) {
  const userIds = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'USER' },
      ProjectionExpression: '#pk, #sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      if (item.sk) {
        userIds.push(item.sk);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (userIds.length > 0 && userIds.length % 500 === 0) {
      process.stdout.write(`\r  scanned users: ${userIds.length}`);
    }
  } while (lastEvaluatedKey);

  if (userIds.length >= 500) {
    process.stdout.write('\n');
  }

  return userIds;
}

async function queryPartition(docClient, tableName, pk) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function backfillForUser(docClient, tableName, userId, dryRun, stats, notifications) {
  const {
    backfillCompletedGameChatNotification,
    hasActiveCompletedGameChatNotification,
  } = notifications;

  if (await isBotId(docClient, tableName, userId)) {
    stats.usersSkippedBot = (stats.usersSkippedBot ?? 0) + 1;
    return;
  }

  const recentCompletedRows = await queryPartition(docClient, tableName, `RECENTCOMPLETED#${userId}`);
  const userGameRows = await queryPartition(docClient, tableName, `USERGAME#${userId}`);

  stats.recentCompletedRows = (stats.recentCompletedRows ?? 0) + recentCompletedRows.length;

  for (const row of recentCompletedRows) {
    const gameId = row.sk;
    if (!gameId) {
      continue;
    }
    const overlay = overlayForGame(userGameRows, gameId);
    const seen = overlay.seen;
    const lastChat = overlay.lastChat;

    if (!hasUnreadCompletedGameChat(seen, lastChat)) {
      continue;
    }

    stats.eligibleUnreadChat = (stats.eligibleUnreadChat ?? 0) + 1;

    if (await hasActiveCompletedGameChatNotification(docClient, tableName, userId, gameId)) {
      stats.skippedDup = (stats.skippedDup ?? 0) + 1;
      continue;
    }

    const metaGame = row.metaGame;
    if (!metaGame) {
      stats.skippedNoMetaGame = (stats.skippedNoMetaGame ?? 0) + 1;
      continue;
    }

    const variants = Array.isArray(row.variants) ? row.variants : [];

    if (dryRun) {
      stats.wouldCreate = (stats.wouldCreate ?? 0) + 1;
      continue;
    }

    const result = await backfillCompletedGameChatNotification(
      docClient,
      tableName,
      userId,
      gameId,
      metaGame,
      variants,
    );
    if (result === 'created') {
      stats.created = (stats.created ?? 0) + 1;
    } else {
      stats.skippedDup = (stats.skippedDup ?? 0) + 1;
    }
  }
}

function printStats(stats) {
  console.log('\nBackfill stats:');
  for (const [key, value] of Object.entries(stats).sort()) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  ensureCompiledLib();
  const { stage, dryRun, userId } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];
  const notifications = require('../lib/notifications.js');

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

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Profile: ${profile}`);
  console.log(`Dry run: ${dryRun}`);
  if (userId) {
    console.log(`User id: ${userId}`);
  }

  const stats = { usersProcessed: 0 };

  if (userId) {
    const user = await getUserRecord(docClient, table, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      process.exit(1);
    }
    stats.usersProcessed = 1;
    await backfillForUser(docClient, table, userId, dryRun, stats, notifications);
  } else {
    console.log('\nScanning USER records…');
    const userIds = await scanAllUserIds(docClient, table);
    stats.usersProcessed = userIds.length;
    console.log(`  found ${userIds.length} USER records`);

    for (const id of userIds) {
      await backfillForUser(docClient, table, id, dryRun, stats, notifications);
    }
  }

  printStats(stats);
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
