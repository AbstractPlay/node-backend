#!/usr/bin/env node
/* eslint-env node */
/**
 * Phase 2 normalization backfill (admin maintenance).
 *
 * Steps:
 *   user-index          — CURRENTGAMES# + USERGAME# from USER.games[] (insert-only)
 *   sync-overlays       — Phase 2b: upsert USERGAME# from USER.games[] + delete orphan rows
 *   sync-current-games     — Upsert CURRENTGAMES# from USER.games[] (fixes missing summary fields e.g. numMoves)
 *   sync-recent-completed  — Upsert RECENTCOMPLETED# from eligible USER.games[] completed entries (Phase 3b)
 *   prune-stale-recent-completed — Delete RECENTCOMPLETED# rows not dashboard-eligible (merged USERGAME# overlays)
 *   purge-usergame-orphans — Delete USERGAME# rows for games not on the user's dashboard
 *   strip-legacy-overlays  — Remove seen/lastChat from USER.games[] (Phase 4a; USERGAME# is sole overlay store)
 *   meta-counts            — METAGAMES#<metaGame>/COUNTS from monolith METAGAMES/COUNTS
 *   all                 — user-index + meta-counts (default; does not include sync steps)
 *
 * Conditional writes skip rows that already exist (stream or prior backfill).
 *
 * Usage:
 *   node bin/backfill-normalization-phase2.mjs [--stage dev|prod] [--dry-run]
 *     [--step user-index|sync-overlays|sync-current-games|sync-recent-completed|prune-stale-recent-completed|purge-usergame-orphans|meta-counts|all] [--user-id <cognitoSub>]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { createRequire } from 'module';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const require = createRequire(import.meta.url);
const { gameinfo } = require('@abstractplay/gameslib');

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

const DEFAULT_META_GAME_COUNTS = {
  currentgames: 0,
  completedgames: 0,
  standingchallenges: 0,
  stars: 0,
};

function usage() {
  console.error(`Usage: node bin/backfill-normalization-phase2.mjs [options]

Options:
  --stage dev|prod          AWS profile + DynamoDB table (default: dev)
  --dry-run                 Count actions only; do not write
  --step user-index|sync-overlays|sync-current-games|sync-recent-completed|prune-stale-recent-completed|purge-usergame-orphans|strip-legacy-overlays|meta-counts|all   Step (default: all)
  --sync-overlays           Shorthand for --step sync-overlays
  --sync-current-games      Shorthand for --step sync-current-games
  --sync-recent-completed   Shorthand for --step sync-recent-completed
  --prune-stale-recent-completed  Shorthand for --step prune-stale-recent-completed
  --purge-usergame-orphans  Shorthand for --step purge-usergame-orphans
  --strip-legacy-overlays   Shorthand for --step strip-legacy-overlays
  --user-id <cognitoSub>    Single user (user-index, sync-overlays, sync-current-games, sync-recent-completed, prune-stale-recent-completed, purge-usergame-orphans, strip-legacy-overlays)
  --help, -h                Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let step = 'all';
  let userId;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--step' && argv[i + 1]) {
      step = argv[++i];
    } else if (arg === '--user-id' && argv[i + 1]) {
      userId = argv[++i];
    } else if (arg === '--sync-overlays') {
      step = 'sync-overlays';
    } else if (arg === '--sync-current-games') {
      step = 'sync-current-games';
    } else if (arg === '--sync-recent-completed') {
      step = 'sync-recent-completed';
    } else if (arg === '--prune-stale-recent-completed') {
      step = 'prune-stale-recent-completed';
    } else if (arg === '--purge-usergame-orphans') {
      step = 'purge-usergame-orphans';
    } else if (arg === '--strip-legacy-overlays') {
      step = 'strip-legacy-overlays';
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
  if (!['user-index', 'sync-overlays', 'sync-current-games', 'sync-recent-completed', 'prune-stale-recent-completed', 'purge-usergame-orphans', 'strip-legacy-overlays', 'meta-counts', 'all'].includes(step)) {
    console.error(`Unknown step: ${step}`);
    usage();
  }

  return { stage, dryRun, step, userId };
}

function isActiveDashboardGame(game) {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

function toRecentCompletedSummaryFromUserGame(game) {
  return {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    toMove: '',
    lastMoveTime: game.lastMoveTime,
    variants: game.variants,
    gameStarted: game.gameStarted,
    gameEnded: game.gameEnded,
    winner: game.winner,
    numMoves: game.numMoves ?? 0,
    commented: game.commented,
  };
}

const COMPLETED_DASHBOARD_RETENTION_MS = 7 * 24 * 3600000;

function shouldBeOnCompletedDashboard(game, now = Date.now()) {
  if (isActiveDashboardGame(game)) {
    return false;
  }
  if (game.seen === undefined) {
    return true;
  }
  if ((game.lastChat || 0) > game.seen) {
    return true;
  }
  return now - game.seen <= COMPLETED_DASHBOARD_RETENTION_MS;
}

function applyOverlayFields(game, overlayRow, legacy) {
  const result = { ...game };
  const seen = overlayRow?.seen ?? legacy?.seen;
  const lastChat = overlayRow?.lastChat ?? legacy?.lastChat;
  if (seen !== undefined) {
    result.seen = seen;
  } else {
    delete result.seen;
  }
  if (lastChat !== undefined) {
    result.lastChat = lastChat;
  } else {
    delete result.lastChat;
  }
  return result;
}

function recentCompletedRowToGame(row) {
  return {
    id: row.id ?? row.sk,
    metaGame: row.metaGame,
    toMove: row.toMove ?? '',
    lastMoveTime: row.lastMoveTime,
  };
}

function completedGameForEligibility(row, legacyById, overlayById) {
  const legacy = legacyById.get(row.sk);
  const base = legacy && !isActiveDashboardGame(legacy)
    ? legacy
    : recentCompletedRowToGame(row);
  return applyOverlayFields(base, overlayById.get(row.sk), legacy);
}

function recentCompletedItemFromUserGame(userId, game) {
  const summary = toRecentCompletedSummaryFromUserGame(game);
  return {
    pk: `RECENTCOMPLETED#${userId}`,
    sk: game.id,
    ...summary,
  };
}

function toCurrentSummaryFromUserGame(game) {
  return {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
    variants: game.variants,
    gameStarted: game.gameStarted,
    numMoves: game.numMoves ?? 0,
  };
}

function currentGamesItemFromUserGame(userId, game) {
  const summary = toCurrentSummaryFromUserGame(game);
  return {
    pk: `CURRENTGAMES#${userId}`,
    sk: game.id,
    ...summary,
  };
}

function toUserGameOverlay(game) {
  const overlay = { id: game.id };
  if (game.seen !== undefined) {
    overlay.seen = game.seen;
  }
  if (game.lastChat !== undefined) {
    overlay.lastChat = game.lastChat;
  }
  return overlay;
}

function hasUserGameOverlay(game) {
  return game.seen !== undefined || game.lastChat !== undefined;
}

async function putIfAbsent(docClient, tableName, item, dryRun, stats, label) {
  if (dryRun) {
    stats[label] = (stats[label] ?? 0) + 1;
    return 'dry-run';
  }
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
    stats[label] = (stats[label] ?? 0) + 1;
    return 'written';
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      stats[`${label}Skipped`] = (stats[`${label}Skipped`] ?? 0) + 1;
      return 'skipped';
    }
    throw err;
  }
}

async function backfillUserRecord(docClient, tableName, userId, games, dryRun, stats) {
  for (const game of games) {
    if (!game?.id || !game.metaGame) {
      stats.invalidGames = (stats.invalidGames ?? 0) + 1;
      continue;
    }

    if (isActiveDashboardGame(game)) {
      const summary = toCurrentSummaryFromUserGame(game);
      await putIfAbsent(docClient, tableName, {
        pk: `CURRENTGAMES#${userId}`,
        sk: game.id,
        ...summary,
      }, dryRun, stats, 'currentGames');
    }

    if (hasUserGameOverlay(game)) {
      const overlay = toUserGameOverlay(game);
      const { id, ...fields } = overlay;
      await putIfAbsent(docClient, tableName, {
        pk: `USERGAME#${userId}`,
        sk: id,
        ...fields,
      }, dryRun, stats, 'userGames');
    }
  }
}

async function getUserRecord(docClient, tableName, userId) {
  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#pk, #sk, games, gamesUpdate',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
  }));
  return data.Item;
}

function stripOverlayFields(game) {
  const result = { ...game };
  delete result.seen;
  delete result.lastChat;
  return result;
}

async function stripLegacyOverlaysForUser(docClient, tableName, userId, dryRun, stats) {
  const user = await getUserRecord(docClient, tableName, userId);
  if (!user) {
    return;
  }
  const games = user.games ?? [];
  if (!games.some(game => game.seen !== undefined || game.lastChat !== undefined)) {
    return;
  }
  const stripped = games.map(stripOverlayFields);
  if (dryRun) {
    stats.gamesStripped = (stats.gamesStripped ?? 0) + 1;
    return;
  }
  if (user.gamesUpdate === undefined) {
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ExpressionAttributeValues: { ':val': 1, ':gs': stripped },
      UpdateExpression: 'set gamesUpdate = :val, games = :gs',
    }));
  } else {
    await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ExpressionAttributeValues: { ':val': user.gamesUpdate, ':inc': 1, ':gs': stripped },
      ConditionExpression: 'gamesUpdate = :val',
      UpdateExpression: 'set gamesUpdate = gamesUpdate + :inc, games = :gs',
    }));
  }
  stats.gamesStripped = (stats.gamesStripped ?? 0) + 1;
}

async function stripLegacyOverlays(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nStripping seen/lastChat from USER.games[] (USERGAME# is overlay store)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await stripLegacyOverlaysForUser(docClient, tableName, userId, dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await stripLegacyOverlaysForUser(docClient, tableName, user.sk, dryRun, stats);
  }

  return stats;
}

async function scanAllUsers(docClient, tableName) {
  const users = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'USER' },
      ProjectionExpression: '#pk, #sk, games',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      users.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (users.length > 0 && users.length % 500 === 0) {
      process.stdout.write(`\r  scanned users: ${users.length}`);
    }
  } while (lastEvaluatedKey);

  if (users.length >= 500) {
    process.stdout.write('\n');
  }

  return users;
}

async function queryUserGameRows(docClient, tableName, userId) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `USERGAME#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

function overlayItemFromGame(userId, game) {
  const overlay = toUserGameOverlay(game);
  const { id, ...fields } = overlay;
  return {
    pk: `USERGAME#${userId}`,
    sk: id,
    ...fields,
  };
}

async function syncOverlaysForUser(docClient, tableName, userId, games, dryRun, stats) {
  const expectedIds = new Set();

  for (const game of games) {
    if (!game?.id || !hasUserGameOverlay(game)) {
      continue;
    }
    expectedIds.add(game.id);
    if (dryRun) {
      stats.userGamesUpserted = (stats.userGamesUpserted ?? 0) + 1;
      continue;
    }
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: overlayItemFromGame(userId, game),
    }));
    stats.userGamesUpserted = (stats.userGamesUpserted ?? 0) + 1;
  }

  const existing = await queryUserGameRows(docClient, tableName, userId);
  for (const row of existing) {
    if (expectedIds.has(row.sk)) {
      continue;
    }
    if (dryRun) {
      stats.userGamesDeleted = (stats.userGamesDeleted ?? 0) + 1;
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: row.pk, sk: row.sk },
    }));
    stats.userGamesDeleted = (stats.userGamesDeleted ?? 0) + 1;
  }
}

async function syncOverlays(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nSyncing USERGAME# overlays from USER.games[] (upsert + delete orphans)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await syncOverlaysForUser(docClient, tableName, userId, user.games ?? [], dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await syncOverlaysForUser(docClient, tableName, user.sk, user.games ?? [], dryRun, stats);
  }

  return stats;
}

async function syncCurrentGamesForUser(docClient, tableName, userId, games, dryRun, stats) {
  for (const game of games) {
    if (!game?.id || !game.metaGame || !isActiveDashboardGame(game)) {
      continue;
    }
    if (dryRun) {
      stats.currentGamesUpserted = (stats.currentGamesUpserted ?? 0) + 1;
      continue;
    }
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: currentGamesItemFromUserGame(userId, game),
    }));
    stats.currentGamesUpserted = (stats.currentGamesUpserted ?? 0) + 1;
  }
}

async function syncCurrentGames(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nSyncing CURRENTGAMES# from USER.games[] active games (upsert)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await syncCurrentGamesForUser(docClient, tableName, userId, user.games ?? [], dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await syncCurrentGamesForUser(docClient, tableName, user.sk, user.games ?? [], dryRun, stats);
  }

  return stats;
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

function dashboardGameIds(games, currentGameRows, recentCompletedRows) {
  const ids = new Set();
  for (const game of games) {
    if (game?.id) {
      ids.add(game.id);
    }
  }
  for (const row of currentGameRows) {
    if (row.sk) {
      ids.add(row.sk);
    }
  }
  for (const row of recentCompletedRows) {
    if (row.sk) {
      ids.add(row.sk);
    }
  }
  return ids;
}

async function syncRecentCompletedForUser(docClient, tableName, userId, games, dryRun, stats) {
  for (const game of games) {
    if (!game?.id || !game.metaGame || !shouldBeOnCompletedDashboard(game)) {
      continue;
    }
    if (dryRun) {
      stats.recentCompletedUpserted = (stats.recentCompletedUpserted ?? 0) + 1;
      continue;
    }
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: recentCompletedItemFromUserGame(userId, game),
    }));
    stats.recentCompletedUpserted = (stats.recentCompletedUpserted ?? 0) + 1;
  }
}

async function syncRecentCompleted(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nSyncing RECENTCOMPLETED# from USER.games[] eligible completed games (upsert)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await syncRecentCompletedForUser(docClient, tableName, userId, user.games ?? [], dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await syncRecentCompletedForUser(docClient, tableName, user.sk, user.games ?? [], dryRun, stats);
  }

  return stats;
}

async function pruneStaleRecentCompletedForUser(docClient, tableName, userId, games, dryRun, stats) {
  const recentCompletedRows = await queryPartition(docClient, tableName, `RECENTCOMPLETED#${userId}`);
  const userGameRows = await queryUserGameRows(docClient, tableName, userId);
  const legacyById = new Map((games ?? []).filter(game => game?.id).map(game => [game.id, game]));
  const overlayById = new Map(userGameRows.map(row => [row.sk, row]));
  const now = Date.now();

  for (const row of recentCompletedRows) {
    const merged = completedGameForEligibility(row, legacyById, overlayById);
    if (shouldBeOnCompletedDashboard(merged, now)) {
      continue;
    }
    if (dryRun) {
      stats.recentCompletedPruned = (stats.recentCompletedPruned ?? 0) + 1;
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: row.pk, sk: row.sk },
    }));
    stats.recentCompletedPruned = (stats.recentCompletedPruned ?? 0) + 1;
  }
}

async function pruneStaleRecentCompleted(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nPruning stale RECENTCOMPLETED# rows (not dashboard-eligible with merged overlays)…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await pruneStaleRecentCompletedForUser(docClient, tableName, userId, user.games ?? [], dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await pruneStaleRecentCompletedForUser(docClient, tableName, user.sk, user.games ?? [], dryRun, stats);
  }

  return stats;
}


async function purgeUserGameOrphansForUser(docClient, tableName, userId, games, dryRun, stats) {
  const currentRows = await queryPartition(docClient, tableName, `CURRENTGAMES#${userId}`);
  const recentCompletedRows = await queryPartition(docClient, tableName, `RECENTCOMPLETED#${userId}`);
  const onDashboard = dashboardGameIds(games, currentRows, recentCompletedRows);
  const userGameRows = await queryUserGameRows(docClient, tableName, userId);

  for (const row of userGameRows) {
    if (onDashboard.has(row.sk)) {
      continue;
    }
    if (dryRun) {
      stats.userGamesDeleted = (stats.userGamesDeleted ?? 0) + 1;
      continue;
    }
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: row.pk, sk: row.sk },
    }));
    stats.userGamesDeleted = (stats.userGamesDeleted ?? 0) + 1;
  }
}

async function purgeUserGameOrphans(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nPurging USERGAME# rows not on user dashboard…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await purgeUserGameOrphansForUser(docClient, tableName, userId, user.games ?? [], dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await purgeUserGameOrphansForUser(docClient, tableName, user.sk, user.games ?? [], dryRun, stats);
  }

  return stats;
}

async function backfillUserIndex(docClient, tableName, { dryRun, userId }) {
  const stats = { users: 0 };

  console.log('\nBackfilling CURRENTGAMES# and USERGAME# from USER.games[]…');

  if (userId) {
    const user = await getUserRecord(docClient, tableName, userId);
    if (!user) {
      console.error(`No USER record for ${userId}`);
      return stats;
    }
    stats.users = 1;
    await backfillUserRecord(docClient, tableName, userId, user.games ?? [], dryRun, stats);
    return stats;
  }

  const users = await scanAllUsers(docClient, tableName);
  stats.users = users.length;
  console.log(`  found ${users.length} USER records`);

  for (const user of users) {
    await backfillUserRecord(docClient, tableName, user.sk, user.games ?? [], dryRun, stats);
  }

  return stats;
}

async function backfillMetaCounts(docClient, tableName, dryRun) {
  const stats = {};

  console.log('\nBackfilling METAGAMES#<metaGame>/COUNTS from monolith…');

  const data = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'METAGAMES', sk: 'COUNTS' },
  }));
  const monolith = data.Item ?? {};

  const metaGames = [];
  gameinfo.forEach(g => metaGames.push(g.uid));

  for (const metaGame of metaGames) {
    const source = monolith[metaGame] ?? DEFAULT_META_GAME_COUNTS;
    const ratingsKey = `${metaGame}_ratings`;
    const ratingsValue = monolith[ratingsKey];
    const ratingsCount = ratingsValue?.size ?? ratingsValue?.values?.length ?? 0;

    const item = {
      pk: `METAGAMES#${metaGame}`,
      sk: 'COUNTS',
      currentgames: source.currentgames ?? 0,
      completedgames: source.completedgames ?? 0,
      standingchallenges: source.standingchallenges ?? 0,
      stars: source.stars ?? 0,
      ratingsCount,
    };

    await putIfAbsent(docClient, tableName, item, dryRun, stats, 'metaCounts');
  }

  stats.metaGames = metaGames.length;
  return stats;
}

function printStats(label, stats) {
  console.log(`\n${label}:`);
  for (const [key, value] of Object.entries(stats).sort()) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main() {
  const { stage, dryRun, step, userId } = parseArgs(process.argv);
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

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Profile: ${profile}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Step: ${step}`);
  if (userId) {
    console.log(`User id: ${userId}`);
  }
  console.log(`Meta games in gameinfo: ${[...gameinfo.keys()].length}`);

  if (step === 'user-index' || step === 'all') {
    const stats = await backfillUserIndex(docClient, table, { dryRun, userId });
    printStats('User index backfill', stats);
  }

  if (step === 'sync-overlays') {
    const stats = await syncOverlays(docClient, table, { dryRun, userId });
    printStats('USERGAME overlay sync', stats);
  }

  if (step === 'sync-current-games') {
    const stats = await syncCurrentGames(docClient, table, { dryRun, userId });
    printStats('CURRENTGAMES sync', stats);
  }

  if (step === 'sync-recent-completed') {
    const stats = await syncRecentCompleted(docClient, table, { dryRun, userId });
    printStats('RECENTCOMPLETED sync', stats);
  }

  if (step === 'prune-stale-recent-completed') {
    const stats = await pruneStaleRecentCompleted(docClient, table, { dryRun, userId });
    printStats('RECENTCOMPLETED prune', stats);
  }

  if (step === 'purge-usergame-orphans') {
    const stats = await purgeUserGameOrphans(docClient, table, { dryRun, userId });
    printStats('USERGAME orphan purge', stats);
  }

  if (step === 'strip-legacy-overlays') {
    const stats = await stripLegacyOverlays(docClient, table, { dryRun, userId });
    printStats('Legacy overlay strip', stats);
  }

  if (step === 'meta-counts' || step === 'all') {
    if (userId) {
      console.warn('\n--user-id is ignored for meta-counts step');
    }
    const stats = await backfillMetaCounts(docClient, table, dryRun);
    printStats('Meta counts backfill', stats);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
