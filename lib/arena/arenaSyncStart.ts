import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { isArenaGame } from '../gamePlayMode.js';
import { wsBroadcast } from '../wsBroadcast.js';
import { rescheduleArenaFlagForGame } from './rescheduleArenaFlag.js';
import { ARENA_COUNTDOWN_MS } from './constants.js';

type ArenaGameRow = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  state: string;
  players: { id: string; name: string; time?: number; seat?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
  clockGeneration?: number;
  playMode?: string;
  arenaPlayReady?: string[];
  arenaClockStartAt?: number;
  gameEnded?: number;
};

export async function broadcastArenaLaunch(opts: {
  metaGame: string;
  gameId: string;
  playerIds: string[];
}): Promise<void> {
  await Promise.all(
    opts.playerIds.map((userId) =>
      wsBroadcast('arena_launch', {
        userId,
        metaGame: opts.metaGame,
        gameId: opts.gameId,
      }),
    ),
  );
}

export async function broadcastArenaSync(opts: {
  metaGame: string;
  gameId: string;
  playerIds: string[];
  arenaClockStartAt: number;
  serverTime: number;
}): Promise<void> {
  await Promise.all(
    opts.playerIds.map((userId) =>
      wsBroadcast('arena_sync', {
        userId,
        metaGame: opts.metaGame,
        gameId: opts.gameId,
        arenaClockStartAt: opts.arenaClockStartAt,
        serverTime: opts.serverTime,
      }),
    ),
  );
}

export async function beginArenaCountdown(
  client: DynamoDBDocumentClient,
  tableName: string,
  game: ArenaGameRow,
  now: number,
): Promise<number> {
  const arenaClockStartAt = now + ARENA_COUNTDOWN_MS;
  game.arenaClockStartAt = arenaClockStartAt;
  game.lastMoveTime = arenaClockStartAt;
  await client.send(new PutCommand({
    TableName: tableName,
    Item: prepareGameStateForStorage(game as { state: string }),
  }));
  await rescheduleArenaFlagForGame({
    id: game.id,
    metaGame: game.metaGame,
    clockGeneration: game.clockGeneration,
    players: game.players,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
  });
  const playerIds = game.players.map((p) => p.id);
  await broadcastArenaSync({
    metaGame: game.metaGame,
    gameId: game.id,
    playerIds,
    arenaClockStartAt,
    serverTime: now,
  });
  return arenaClockStartAt;
}

export async function recordArenaPlayReady(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<
  | { ok: true; waitingForOpponent: true }
  | { ok: true; waitingForOpponent: false; arenaClockStartAt: number }
  | { error: string }
> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: {
      pk: 'GAME',
      sk: `${metaGame}#0#${gameId}`,
    },
  }));
  if (!data.Item) {
    return { error: 'Game not found.' };
  }
  const game = hydrateGameState(data.Item as ArenaGameRow) as ArenaGameRow;
  if (!isArenaGame(game)) {
    return { error: 'Not an arena game.' };
  }
  if (game.gameEnded !== undefined || game.toMove === '' || game.toMove === null) {
    return { error: 'Game is not in progress.' };
  }
  const seated = game.players.some((p) => p.id === userId);
  if (!seated) {
    return { error: 'You are not a player in this game.' };
  }
  if (game.arenaClockStartAt !== undefined) {
    return {
      ok: true,
      waitingForOpponent: false,
      arenaClockStartAt: game.arenaClockStartAt,
    };
  }

  const ready = [...(game.arenaPlayReady ?? [])];
  if (!ready.includes(userId)) {
    ready.push(userId);
  }
  game.arenaPlayReady = ready;

  const allReady = game.players.every((p) => ready.includes(p.id));
  if (!allReady) {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: prepareGameStateForStorage(game as { state: string }),
    }));
    return { ok: true, waitingForOpponent: true };
  }

  const now = Date.now();
  const arenaClockStartAt = await beginArenaCountdown(client, tableName, game, now);
  return { ok: true, waitingForOpponent: false, arenaClockStartAt };
}
