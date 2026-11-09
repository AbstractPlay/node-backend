#!/usr/bin/env node
/* eslint-env node */
/**
 * List correspondence games likely ended by vacation-stop retroactive clock charge.
 *
 * Signature: wall think time exceeded bank without vacation overlap, but with
 * inferred or recorded stint overlap think time would stay within bank.
 *
 * Usage:
 *   npx tsx scripts/report-vacation-stop-clock-incident.mjs --stage prod
 *   npx tsx scripts/report-vacation-stop-clock-incident.mjs --stage prod --since 2026-10-31
 *   npx tsx scripts/report-vacation-stop-clock-incident.mjs --stage prod --userId <uuid>
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameFactory } from '@abstractplay/gameslib';
import { hydrateGameState } from '../lib/gameState.ts';
import { deriveGameEndMeta } from '../lib/gameEndMeta.ts';
import {
  thinkTimeMsWithVacationOverlap,
} from '../lib/clockElapsed.ts';
import { vacationClockStintsFromItem } from '../lib/vacation/clockStints.ts';
import { isArenaGame } from '../lib/gamePlayMode.ts';
import { parseGameSk } from '../lib/gameProjector.ts';

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

const DEFAULT_SINCE = Date.parse('2026-10-31T00:00:00.000Z');
const MIN_PAUSE_MS = 3_600_000;

function usage() {
  console.error(`Usage: npx tsx scripts/report-vacation-stop-clock-incident.mjs [options]

Options:
  --stage dev|prod     AWS profile + table (default: dev)
  --since YYYY-MM-DD   Only games ending on/after this UTC date (default: 2026-10-31)
  --userId <uuid>      Only games where this player timed out
  --min-pause-hours N  Minimum inferred vacation ms to consider (default: 1)
  --relaxed            Also list timeouts where wall time exceeded bank and loser has vacation quota used (manual triage)
  --debug              Log rejection counts to stderr (why rows were skipped)
  --out <path>         Write CSV to path (default: stdout table)
  --help, -h           Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let since = DEFAULT_SINCE;
  let userId;
  let minPauseMs = MIN_PAUSE_MS;
  let outPath;
  let relaxed = false;
  let debug = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--since' && argv[i + 1]) {
      since = Date.parse(`${argv[++i]}T00:00:00.000Z`);
    } else if (arg === '--userId' && argv[i + 1]) {
      userId = argv[++i];
    } else if (arg === '--min-pause-hours' && argv[i + 1]) {
      minPauseMs = Number(argv[++i]) * 3_600_000;
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (arg === '--relaxed') {
      relaxed = true;
    } else if (arg === '--debug') {
      debug = true;
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

  return { stage, since, userId, minPauseMs, outPath, relaxed, debug };
}

async function scanCompletedGamesSince(docClient, tableName, sinceMs) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk AND attribute_exists(#ended) AND #ended >= :since',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#ended': 'gameEnded',
      },
      ExpressionAttributeValues: {
        ':pk': 'GAME',
        ':since': sinceMs,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      const parsed = parseGameSk(String(item.sk ?? ''));
      if (parsed?.cbit === '1') {
        items.push(item);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

function stintWindowsForUser(userItem, gameEnded) {
  const recorded = vacationClockStintsFromItem(userItem);
  if (recorded.length > 0) {
    return recorded;
  }
  const used = userItem.vacationPauseMsUsed;
  if (typeof used !== 'number' || used <= 0) {
    return [];
  }
  return [{ pauseStart: gameEnded - used, pauseEnd: gameEnded }];
}

function turnIntervalFromState(metaGame, state) {
  try {
    const engine = GameFactory(metaGame, state);
    if (!engine?.stack?.length) {
      return null;
    }
    const stack = engine.stack;
    const gameEnded = new Date(stack[stack.length - 1]._timestamp).getTime();
    const lastMoveTime = stack.length >= 2
      ? new Date(stack[stack.length - 2]._timestamp).getTime()
      : new Date(stack[0]._timestamp).getTime();
    return { lastMoveTime, gameEnded };
  } catch {
    return null;
  }
}

/** COMPLETEDGAMES / deriveGameEndMeta use 1-based seats (see docs/database-schema.md). */
function timedOutPlayerIndex(game, meta) {
  if (meta?.gameEndKind !== 'timeout' || typeof meta.gameEndPlayer !== 'number') {
    return undefined;
  }
  const seat = meta.gameEndPlayer;
  const idx = seat - 1;
  if (idx < 0 || idx >= game.players.length) {
    return undefined;
  }
  return idx;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const { stage, since, userId, minPauseMs, outPath, relaxed, debug } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  console.error(`Scanning completed games on ${table} since ${new Date(since).toISOString()}...`);

  const games = await scanCompletedGamesSince(docClient, table, since);
  const rows = [];
  let scanned = 0;
  let timeoutGames = 0;
  const rejects = {
    noInterval: 0,
    noTimeoutMeta: 0,
    noLoserSeat: 0,
    userFilter: 0,
    noVacationPause: 0,
    wallNotOverBank: 0,
    notConfident: 0,
  };

  for (const raw of games) {
    scanned += 1;
    const game = hydrateGameState(raw);
    if (!game?.state) {
      continue;
    }
    const interval = turnIntervalFromState(game.metaGame, game.state);
    if (!interval) {
      rejects.noInterval += 1;
      continue;
    }
    if (isArenaGame(game)) {
      continue;
    }

    const meta = deriveGameEndMeta(game.metaGame, game.state);
    if (meta?.gameEndKind !== 'timeout') {
      rejects.noTimeoutMeta += 1;
      continue;
    }
    timeoutGames += 1;

    const loserIdx = timedOutPlayerIndex(game, meta);
    if (loserIdx === undefined || !game.players[loserIdx]) {
      rejects.noLoserSeat += 1;
      continue;
    }
    const loser = game.players[loserIdx];
    if (userId && loser.id !== userId) {
      rejects.userFilter += 1;
      continue;
    }

    const userKey = { pk: 'USER', sk: loser.id };
    const userRes = await docClient.send(new GetCommand({
      TableName: table,
      Key: userKey,
      ProjectionExpression: 'vacationPauseMsUsed, vacationClockStints',
    }));
    const userItem = userRes.Item ?? {};
    const recorded = vacationClockStintsFromItem(userItem);
    const { lastMoveTime, gameEnded } = interval;
    const stintWindows = recorded.length > 0
      ? recorded
      : stintWindowsForUser(userItem, gameEnded);
    const stintSource = recorded.length > 0 ? 'recorded' : 'inferred_quota';
    const pauseMsCharged = stintWindows.reduce((max, s) => Math.max(max, s.pauseEnd - s.pauseStart), 0);
    if (pauseMsCharged < minPauseMs) {
      rejects.noVacationPause += 1;
      continue;
    }

    const bank = loser.time ?? 0;
    const wallThink = gameEnded - lastMoveTime;
    if (wallThink <= bank) {
      rejects.wallNotOverBank += 1;
      continue;
    }

    const fairThink = thinkTimeMsWithVacationOverlap(
      lastMoveTime,
      gameEnded,
      stintWindows,
    );
    const confident = fairThink <= bank;
    if (!confident && !relaxed) {
      rejects.notConfident += 1;
      continue;
    }

    rows.push({
      confidence: confident ? 'high' : 'relaxed',
      gameId: game.id,
      metaGame: game.metaGame,
      clockHard: game.clockHard === true,
      timedOutSeat: meta.gameEndPlayer,
      loserId: loser.id,
      loserName: loser.name ?? '',
      bankMs: bank,
      wallThinkMs: wallThink,
      fairThinkMs: fairThink,
      stintSource,
      pauseMsCharged,
      gameEnded,
      lastMoveTime,
    });
  }

  rows.sort((a, b) => b.gameEnded - a.gameEnded);

  const header = [
    'confidence',
    'gameId',
    'metaGame',
    'clockHard',
    'timedOutSeat',
    'loserId',
    'loserName',
    'bankMs',
    'wallThinkMs',
    'fairThinkMs',
    'stintSource',
    'pauseMsCharged',
    'gameEnded',
    'lastMoveTime',
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map(k => csvEscape(row[k])).join(','));
  }

  const body = `${lines.join('\n')}\n`;
  if (outPath) {
    const { writeFile } = await import('node:fs/promises');
    const resolvedOut = path.isAbsolute(outPath)
      ? outPath
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', outPath);
    await writeFile(resolvedOut, body, 'utf8');
    console.error(`Wrote ${rows.length} rows to ${resolvedOut}`);
  } else {
    process.stdout.write(body);
  }

  console.error(
    `Done: scanned ${scanned} completed games, ${timeoutGames} timeouts, `
    + `${rows.length} likely vacation-stop clock incidents`,
  );
  if (debug) {
    console.error('Rejection counts (among completed items with gameEnded filter):', rejects);
  }
}

await main();
