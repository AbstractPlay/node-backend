#!/usr/bin/env node
/* eslint-env node */
/**
 * Ops CLI: recompute METAGAMES#<meta>/COUNTS from live queries (same as auth update_meta_game_counts).
 *
 * Usage:
 *   npx tsx scripts/update-meta-game-counts.mjs --stage prod --adminUserId <cognito-sub>
 *   npx tsx scripts/update-meta-game-counts.mjs --stage prod --discover-admin
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { updateMetaGameCounts } from '../lib/games/adminHandlers.ts';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

function usage() {
  console.error(`Usage: npx tsx scripts/update-meta-game-counts.mjs --stage dev|prod (--adminUserId <sub> | --discover-admin)`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let adminUserId = process.env.ADMIN_USER_ID;
  let discoverAdmin = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--adminUserId' && argv[i + 1]) {
      adminUserId = argv[++i];
    } else if (arg === '--discover-admin') {
      discoverAdmin = true;
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
  if (!adminUserId && !discoverAdmin) {
    console.error('Provide --adminUserId, set ADMIN_USER_ID, or use --discover-admin');
    usage();
  }

  return { stage, adminUserId, discoverAdmin, profile: STAGES[stage].profile, table: STAGES[stage].table };
}

async function findAdminUserId(profile, table) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));
  let lastKey;
  do {
    const page = await client.send(new ScanCommand({
      TableName: table,
      FilterExpression: '#pk = :pk AND #admin = :t',
      ExpressionAttributeNames: { '#pk': 'pk', '#admin': 'admin' },
      ExpressionAttributeValues: { ':pk': 'USER', ':t': true },
      ProjectionExpression: 'sk',
      ExclusiveStartKey: lastKey,
    }));
    const admin = page.Items?.[0];
    if (admin?.sk) {
      return String(admin.sk);
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  throw new Error('No admin USER row found');
}

async function main() {
  const args = parseArgs(process.argv);
  process.env.AWS_PROFILE = args.profile;
  process.env.ABSTRACT_PLAY_TABLE = args.table;

  let adminUserId = args.adminUserId;
  if (args.discoverAdmin) {
    adminUserId = await findAdminUserId(args.profile, args.table);
    console.log(`Using admin user id: ${adminUserId}`);
  }

  console.log(`Recomputing METAGAMES# counts on ${args.table}…`);
  const result = await updateMetaGameCounts(adminUserId);
  const body = JSON.parse(result.body ?? '{}');
  if (body.metaGames === undefined) {
    console.error('Recount did not run (admin check failed or empty result).');
    process.exit(1);
  }
  console.log(`Updated sharded counts for ${body.metaGames} meta games.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
