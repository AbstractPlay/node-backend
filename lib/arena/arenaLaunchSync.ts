import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { isArenaGame } from '../gamePlayMode.js';
import { isArenaCompetitiveClockLive } from './arenaEffectiveClock.js';
import { deleteArenaFlagForGame } from './rescheduleArenaFlag.js';
import { wsBroadcast } from '../wsBroadcast.js';
import { getArenaTable, getArenaUserTableId, putArenaTable } from './table/store.js';
import { indexStateForTable, syncArenaIndexOnTableWrite } from './table/indexSync.js';
import type { ArenaTableRecord } from './table/types.js';
import { broadcastArenaTableActivity } from './arenaTableActivityWs.js';

export type ArenaLaunchGameRow = {
  pk?: string;
  sk?: string;
  id: string;
  metaGame: string;
  state: string;
  players: { id: string; name?: string; time?: number; seat?: number }[];
  toMove?: string | boolean[];
  numMoves?: number;
  gameEnded?: number;
  playMode?: string;
  arenaPlayReady?: string[];
  arenaClockStartAt?: number;
  lastMoveTime?: number;
  clockGeneration?: number;
};

function tableNameFromEnv(): string {
  const name = process.env.ABSTRACT_PLAY_TABLE;
  if (!name) {
    throw new Error('ABSTRACT_PLAY_TABLE is not set');
  }
  return name;
}

function gameSk(metaGame: string, gameId: string): string {
  return `${metaGame}#0#${gameId}`;
}

export function isArenaLaunchSyncWindow(
  game: Pick<
    ArenaLaunchGameRow,
    'playMode' | 'gameEnded' | 'toMove' | 'numMoves' | 'arenaClockStartAt'
  > | null
  | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!game || !isArenaGame(game)) {
    return false;
  }
  if (game.gameEnded !== undefined) {
    return false;
  }
  if (game.toMove === '' || game.toMove === null || game.toMove === undefined) {
    return false;
  }
  if ((game.numMoves ?? 0) > 0) {
    return false;
  }
  if (isArenaCompetitiveClockLive(game, nowMs)) {
    return false;
  }
  return true;
}

function isSeatedPlayer(game: ArenaLaunchGameRow, userId: string): boolean {
  return game.players.some((p) => p.id === userId);
}

async function loadActiveArenaGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
): Promise<ArenaLaunchGameRow | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: gameSk(metaGame, gameId) },
  }));
  if (!data.Item) {
    return undefined;
  }
  return hydrateGameState(data.Item as ArenaLaunchGameRow) as ArenaLaunchGameRow;
}

async function persistArenaGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  game: ArenaLaunchGameRow,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: prepareGameStateForStorage(game as { state: string }),
  }));
}

async function broadcastGameRefresh(metaGame: string, gameId: string): Promise<void> {
  await wsBroadcast('game', { meta: metaGame, id: gameId });
}

/**
 * Clear caller's play-ready ping; reset countdown if armed but Fischer not live.
 */
export function applyArenaPlayStandDownToGame(
  game: ArenaLaunchGameRow,
  userId: string,
  nowMs: number = Date.now(),
): { ok: true; changed: boolean } | { error: string } {
  if (!isArenaLaunchSyncWindow(game, nowMs)) {
    return { error: 'The game is not waiting to start.' };
  }
  if (!isSeatedPlayer(game, userId)) {
    return { error: 'You are not a player in this game.' };
  }

  const readyBefore = [...(game.arenaPlayReady ?? [])];
  const startAtBefore = game.arenaClockStartAt;
  const lastMoveBefore = game.lastMoveTime;

  const nextReady = readyBefore.filter((id) => id !== userId);
  game.arenaPlayReady = nextReady;

  if (startAtBefore !== undefined && !isArenaCompetitiveClockLive(game, nowMs)) {
    game.arenaClockStartAt = undefined;
    game.arenaPlayReady = [];
    game.lastMoveTime = 0;
  }

  const changed =
    JSON.stringify(game.arenaPlayReady) !== JSON.stringify(readyBefore)
    || game.arenaClockStartAt !== startAtBefore
    || game.lastMoveTime !== lastMoveBefore;

  return { ok: true, changed };
}

export async function standDownArenaPlayReady(
  client: DynamoDBDocumentClient,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<{ ok: true } | { error: string }> {
  const tableName = tableNameFromEnv();
  const game = await loadActiveArenaGame(client, tableName, metaGame, gameId);
  if (game === undefined) {
    return { error: 'Game not found.' };
  }

  const hadCountdown = game.arenaClockStartAt !== undefined;
  const result = applyArenaPlayStandDownToGame(game, userId);
  if ('error' in result) {
    return result;
  }

  if (hadCountdown && game.arenaClockStartAt === undefined) {
    await deleteArenaFlagForGame(gameId);
  }

  if (result.changed) {
    await persistArenaGame(client, tableName, game);
    await broadcastGameRefresh(metaGame, gameId);
  }

  return { ok: true };
}

export async function standDownArenaPlayReadyForUser(
  client: DynamoDBDocumentClient,
  userId: string,
): Promise<void> {
  const tableName = tableNameFromEnv();
  const tableId = await getArenaUserTableId(client, tableName, userId);
  if (!tableId) {
    return;
  }
  const arenaTable = await getArenaTable(client, tableName, tableId);
  if (!arenaTable || arenaTable.state !== 'playing') {
    return;
  }
  try {
    await standDownArenaPlayReady(
      client,
      userId,
      arenaTable.metaGame,
      tableId,
    );
  } catch (err) {
    console.error('standDownArenaPlayReadyForUser failed', userId, tableId, err);
  }
}

function cloneTableForLobbyReset(table: ArenaTableRecord): ArenaTableRecord {
  const now = Date.now();
  const next: ArenaTableRecord = {
    ...table,
    seats: table.seats.map((s) => ({ ...s, ready: false })),
    variants: [...table.variants],
    swapProposalUserId: undefined,
    state: 'seated',
    gameStartedAt: undefined,
    updatedAt: now,
    indexState: 'seated',
  };
  next.indexState = indexStateForTable(next);
  return next;
}

export async function rollbackArenaLaunchToLobby(
  client: DynamoDBDocumentClient,
  userId: string,
  tableId: string,
): Promise<{ ok: true; metaGame: string } | { error: string }> {
  const tableName = tableNameFromEnv();
  const table = await getArenaTable(client, tableName, tableId);
  if (table === undefined) {
    return { error: 'Arena table not found.' };
  }

  const game = await loadActiveArenaGame(client, tableName, table.metaGame, tableId);
  if (game === undefined) {
    return { error: 'Active arena game not found.' };
  }

  const now = Date.now();
  if (!isArenaLaunchSyncWindow(game, now)) {
    return { error: 'This game can no longer be returned to the lobby.' };
  }
  if (!isSeatedPlayer(game, userId)) {
    return { error: 'You are not a player in this game.' };
  }

  await deleteArenaFlagForGame(tableId);

  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: gameSk(table.metaGame, tableId) },
  }));

  const prev: ArenaTableRecord = {
    ...table,
    seats: table.seats.map((s) => ({ ...s })),
  };
  const next = cloneTableForLobbyReset(table);

  await putArenaTable(client, tableName, next);
  await syncArenaIndexOnTableWrite(client, tableName, prev, next);

  await broadcastGameRefresh(table.metaGame, tableId);
  await broadcastArenaTableActivity(next, 'leave', userId);

  return { ok: true, metaGame: table.metaGame };
}
