#!/usr/bin/env node
/* eslint-env node */
/**
 * Dump a user's constructed dashboard payload (read-only).
 *
 * Assembles the same dashboard lists a full `me` auth query returns for games,
 * challenges, watched/highlight/representative games, blocked players, and bots.
 * Uses DynamoDB reads only — no API calls, no writes, no Cognito login.
 *
 * Usage:
 *   npm run build-ts
 *   node bin/dump-dashboard.mjs <cognito-sub> [--stage dev|prod] [--no-prune-seen] [--verbose] [--include-index]
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
} from '@aws-sdk/lib-dynamodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const LIB_ROOT = path.join(__dirname, '..', 'lib');
const REQUIRED_LIBS = [
  'dashboardGames.js',
  'challenges.js',
  'playerGameMarks.js',
  'playerRelations.js',
  'participants.js',
];

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
  console.error(`Usage: node bin/dump-dashboard.mjs <cognito-sub> [--stage dev|prod] [--no-prune-seen] [--verbose] [--include-index]

Options:
  --stage dev|prod     AWS profile + DynamoDB table (default: dev)
  --no-prune-seen      Keep completed games that me() would prune in-memory (seen >7d, no newer chat)
  --verbose            Print source counts to stderr
  --include-index      Include currentRows and recentCompletedRows in output (debug)
  --help, -h           Show this help

Prerequisites:
  npm run build-ts     (compiles lib/*.ts to lib/*.js)
`);
  process.exit(1);
}

function ensureCompiledLib() {
  const missing = REQUIRED_LIBS.filter(name => !existsSync(path.join(LIB_ROOT, name)));
  if (missing.length > 0) {
    console.error(`Missing compiled lib file(s): ${missing.join(', ')}`);
    console.error('Run: npm run build-ts');
    process.exit(1);
  }
}

function parseArgs(argv) {
  let userId;
  let stage = 'dev';
  let pruneSeen = true;
  let verbose = false;
  let includeIndex = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--no-prune-seen') {
      pruneSeen = false;
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--include-index') {
      includeIndex = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else if (!arg.startsWith('-')) {
      userId = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!userId) {
    usage();
  }
  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }

  return { userId, stage, pruneSeen, verbose, includeIndex };
}

function toIdArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (value instanceof Set) {
    return [...value];
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return [];
}

async function main() {
  const { userId, stage, pruneSeen, verbose, includeIndex } = parseArgs(process.argv);
  ensureCompiledLib();

  const {
    loadDashboardGameData,
    pruneSeenCompletedDashboardGames,
  } = require('../lib/dashboardGames.js');
  const { getChallengesByIds } = require('../lib/challenges.js');
  const {
    listWatchedGames,
    listHighlights,
    listUserRecommendations,
  } = require('../lib/playerGameMarks.js');
  const { listBlockedPlayerIds } = require('../lib/playerRelations.js');
  const { getBotRecordsByIds } = require('../lib/participants.js');

  const { profile, table } = STAGES[stage];
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

  const userData = await docClient.send(new GetCommand({
    TableName: table,
    Key: { pk: 'USER', sk: userId },
  }));

  if (userData.Item === undefined) {
    console.error(`No USER record for ${userId}`);
    process.exit(1);
  }

  const user = userData.Item;
  const legacyGames = user.games ?? [];

  const [
    dashboardLoad,
    challengesIssued,
    challengesReceived,
    challengesAccepted,
    standingChallenges,
    standingData,
    watchedGames,
    highlights,
    representatives,
    blocked,
    bots,
  ] = await Promise.all([
    loadDashboardGameData(docClient, table, userId, legacyGames),
    getChallengesByIds(docClient, table, toIdArray(user.challenges_issued)),
    getChallengesByIds(docClient, table, toIdArray(user.challenges_received)),
    getChallengesByIds(docClient, table, toIdArray(user.challenges_accepted)),
    getChallengesByIds(docClient, table, toIdArray(user.challenges_standing)),
    docClient.send(new GetCommand({
      TableName: table,
      Key: { pk: 'REALSTANDING', sk: userId },
    })),
    listWatchedGames(docClient, table, userId),
    listHighlights(docClient, table, userId),
    listUserRecommendations(docClient, table, userId),
    listBlockedPlayerIds(docClient, table, userId),
    getBotRecordsByIds(docClient, table, toIdArray(user.bots)),
  ]);

  let games = dashboardLoad.games;
  if (pruneSeen) {
    ({ games } = pruneSeenCompletedDashboardGames(games));
  }

  const realStanding = standingData.Item?.standing ?? [];

  if (verbose) {
    console.error(`USER legacy games: ${legacyGames.length}`);
    console.error(`CURRENTGAMES# rows: ${dashboardLoad.currentRows.length}`);
    console.error(`RECENTCOMPLETED# rows: ${dashboardLoad.recentCompletedRows.length}`);
    console.error(`Merged games: ${dashboardLoad.games.length} → ${games.length} after prune`);
    console.error(`Challenges issued/received/accepted/standing: ${challengesIssued.length}/${challengesReceived.length}/${challengesAccepted.length}/${standingChallenges.length}`);
    console.error(`Watched/highlight/representative: ${watchedGames.length}/${highlights.length}/${representatives.length}`);
    console.error(`Blocked: ${blocked.length}, bots: ${bots.length}`);
  }

  const payload = {
    userId,
    name: user.name,
    games,
    challengesIssued,
    challengesReceived,
    challengesAccepted,
    standingChallenges,
    realStanding,
    watchedGames,
    highlights,
    representatives,
    blocked,
    bots,
  };

  if (includeIndex) {
    payload.currentRows = dashboardLoad.currentRows;
    payload.recentCompletedRows = dashboardLoad.recentCompletedRows;
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
