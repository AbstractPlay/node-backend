#!/usr/bin/env node
/* eslint-env node */
/**
 * Dump a user's constructed dashboard payload (read-only).
 *
 * Assembles the same dashboard lists a `me_dashboard` auth query returns for games,
 * challenges, watched/highlight/representative games, blocked players, and bots.
 * Uses DynamoDB reads only — no API calls, no writes, no Cognito login.
 *
 * Usage:
 *   npm run dump-dashboard -- <cognito-sub> [--stage dev|prod] [--verbose] [--include-index] [--include-notifications]
 *   npx tsx bin/dump-dashboard.mjs <cognito-sub> [options]
 *
 * Requires tsx (devDependency) to load lib/*.ts sources. Plain `node` will not work.
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { getChallengesByIds } from '../lib/challenges.js';
import { loadDashboardGameData } from '../lib/dashboardGames.js';
import { loadNotificationsForDashboard } from '../lib/notifications.js';
import { getBotRecordsByIds } from '../lib/participants.js';
import {
  listHighlights,
  listUserRecommendations,
  listWatchedGames,
} from '../lib/playerGameMarks.js';
import { listBlockedPlayerIds } from '../lib/playerRelations.js';

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
  console.error(`Usage: npm run dump-dashboard -- <cognito-sub> [--stage dev|prod] [--verbose] [--include-index] [--include-notifications]

Options:
  --stage dev|prod     AWS profile + DynamoDB table (default: dev)
  --verbose            Print source counts to stderr
  --include-index      Include raw CURRENTGAMES# rows in output (debug)
  --include-notifications  Include in-app NOTIFICATION# feed (refreshExpiry: false; read-only)
  --help, -h           Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let userId;
  let stage = 'dev';
  let verbose = false;
  let includeIndex = false;
  let includeNotifications = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--verbose') {
      verbose = true;
    } else if (arg === '--include-index') {
      includeIndex = true;
    } else if (arg === '--include-notifications') {
      includeNotifications = true;
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

  return { userId, stage, verbose, includeIndex, includeNotifications };
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
  const { userId, stage, verbose, includeIndex, includeNotifications } = parseArgs(process.argv);

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
    loadDashboardGameData(docClient, table, userId),
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

  const realStanding = standingData.Item?.standing ?? [];

  let notifications;
  if (includeNotifications) {
    notifications = await loadNotificationsForDashboard(docClient, table, userId, {
      refreshExpiry: false,
    });
  }

  if (verbose) {
    console.error(`CURRENTGAMES# rows: ${dashboardLoad.currentRows.length}`);
    console.error(`Merged games: ${dashboardLoad.games.length}`);
    console.error(`Challenges issued/received/accepted/standing: ${challengesIssued.length}/${challengesReceived.length}/${challengesAccepted.length}/${standingChallenges.length}`);
    console.error(`Watched/highlight/representative: ${watchedGames.length}/${highlights.length}/${representatives.length}`);
    console.error(`Blocked: ${blocked.length}, bots: ${bots.length}`);
    if (includeNotifications) {
      console.error(`Notifications: ${notifications.length}`);
    }
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
  }

  if (includeNotifications) {
    payload.notifications = notifications;
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
