import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { effectiveElapsedMs, wouldTimeOut, type ClockGameSlice } from '../clockElapsed.js';
import {
  isActiveDashboardGame,
  loadDashboardGameData,
  type DashboardGame,
} from '../dashboardGames.js';
import { gameRecordSk } from '../commentAuth.js';
import {
  getLiveVacationWindowFromMap,
  getPlayerVacationFlagsFromMap,
  getVacationWindowFromMap,
  prepareVacationPlayerStateForPlayerIds,
} from './persist.js';
import { enrichDashboardGamesClockDisplay } from './clockDisplay.js';
import { vacationClockStintsFromItem } from './clockStints.js';
import { collectPlayerIdsFromGames } from './load.js';

export type InflightClockCheckRow = {
  gameId: string;
  metaGame: string;
  onClockPlayerId: string;
  onClockPlayerName: string;
  bankMs: number;
  wallThinkMs: number;
  fairThinkMs: number;
  effectiveRemainingMs: number;
  wouldTimeOutNow: boolean;
  clockPaused?: boolean;
  ok: boolean;
  note?: string;
};

export type VerifyInflightClocksResult = {
  userId: string;
  userName?: string;
  vacationStintCount: number;
  vacationPauseMsUsed?: number;
  checkedAt: number;
  hardClockGames: number;
  rows: InflightClockCheckRow[];
  failures: InflightClockCheckRow[];
};

function onClockPlayerIndex(game: ClockGameSlice): number {
  const { toMove } = game;
  if (typeof toMove === 'string' && toMove !== '') {
    const idx = parseInt(toMove, 10);
    return Number.isFinite(idx) ? idx : -1;
  }
  if (Array.isArray(toMove)) {
    return toMove.findIndex(v => v === true);
  }
  return -1;
}

export async function verifyInflightClocksForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  options: { gameIds?: Set<string>; now?: number } = {},
): Promise<VerifyInflightClocksResult> {
  const now = options.now ?? Date.now();

  const userRes = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: '#name, vacationClockStints, vacationPauseMsUsed',
    ExpressionAttributeNames: { '#name': 'name' },
  }));
  const userName = userRes.Item?.name as string | undefined;
  const stints = vacationClockStintsFromItem(userRes.Item ?? {});
  const vacationPauseMsUsed = userRes.Item?.vacationPauseMsUsed as number | undefined;

  const { games: dashboardGames } = await loadDashboardGameData(client, tableName, userId);
  let games = dashboardGames.filter(isActiveDashboardGame);

  if (options.gameIds && options.gameIds.size > 0) {
    games = games.filter(g => options.gameIds!.has(g.id));
  }

  const enrichedBases: DashboardGame[] = [];
  for (const summary of games) {
    if (!summary.clockHard) {
      continue;
    }
    const full = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'GAME', sk: gameRecordSk(summary.metaGame, 0, summary.id) },
    }));
    if (!full.Item) {
      continue;
    }
    const row = full.Item as DashboardGame & { players: DashboardGame['players'] };
    enrichedBases.push({
      ...summary,
      ...row,
      id: summary.id,
      metaGame: summary.metaGame,
      players: row.players ?? summary.players,
      toMove: row.toMove ?? summary.toMove,
      lastMoveTime: row.lastMoveTime ?? summary.lastMoveTime,
      clockHard: row.clockHard ?? summary.clockHard,
    });
  }

  const playerIds = collectPlayerIdsFromGames(enrichedBases);
  const { overlapWindows, liveWindows, flags } = await prepareVacationPlayerStateForPlayerIds(
    client,
    tableName,
    playerIds,
    now,
  );

  const displayGames = enrichDashboardGamesClockDisplay(
    enrichedBases,
    now,
    getVacationWindowFromMap(overlapWindows),
    getPlayerVacationFlagsFromMap(flags),
    getLiveVacationWindowFromMap(liveWindows),
  );

  const rows: InflightClockCheckRow[] = [];
  for (const game of displayGames) {
    const idx = onClockPlayerIndex(game);
    if (idx < 0) {
      rows.push({
        gameId: game.id,
        metaGame: game.metaGame,
        onClockPlayerId: '',
        onClockPlayerName: '',
        bankMs: 0,
        wallThinkMs: 0,
        fairThinkMs: 0,
        effectiveRemainingMs: 0,
        wouldTimeOutNow: false,
        ok: true,
        note: 'no on-clock seat',
      });
      continue;
    }
    const player = game.players[idx]!;
    const bankMs = player.time ?? 0;
    const wallThinkMs = Math.max(0, now - game.lastMoveTime);
    const slice: ClockGameSlice = {
      players: game.players,
      toMove: game.toMove ?? '',
      lastMoveTime: game.lastMoveTime,
    };
    const overlap = getVacationWindowFromMap(overlapWindows)(player.id);
    const fairThinkMs = effectiveElapsedMs({
      lastMoveTime: game.lastMoveTime,
      endTime: now,
      playerId: player.id,
      game: slice,
      vacationWindow: overlap,
    });
    const effectiveRemainingMs = player.effectiveRemainingMs ?? bankMs;
    const wouldTimeOutNow = wouldTimeOut({
      bank: bankMs,
      lastMoveTime: game.lastMoveTime,
      now,
      playerId: player.id,
      game: slice,
      vacationWindow: overlap,
    });
    const ok = !wouldTimeOutNow && effectiveRemainingMs >= 0;
    let note: string | undefined;
    if (wallThinkMs > bankMs && ok) {
      note = 'wall exceeded bank but overlap/credit keeps clock healthy';
    }
    rows.push({
      gameId: game.id,
      metaGame: game.metaGame,
      onClockPlayerId: player.id,
      onClockPlayerName: player.name,
      bankMs,
      wallThinkMs,
      fairThinkMs,
      effectiveRemainingMs,
      wouldTimeOutNow,
      clockPaused: player.clockPaused,
      ok,
      note,
    });
  }

  const failures = rows.filter(r => !r.ok);
  return {
    userId,
    userName,
    vacationStintCount: stints.length,
    vacationPauseMsUsed,
    checkedAt: now,
    hardClockGames: rows.length,
    rows,
    failures,
  };
}
