import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/ddb.js';
import { hydrateGameState } from '../lib/gameState.js';
import { isArenaGame } from '../lib/gamePlayMode.js';
import {
  parseArenaFlagPayload,
  shouldSkipArenaFlagWorker,
} from '../lib/arena/flagPayload.js';
import { arenaTimedOutPlayerIndex } from '../lib/arena/arenaOutOfTime.js';
import { deleteArenaFlagForGame, rescheduleArenaFlagForGame } from '../lib/arena/rescheduleArenaFlag.js';
import { timeloss } from '../lib/games/timeloss.js';

type GameRow = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  state: string;
  players: { id: string; time?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
  playMode?: string;
  clockGeneration?: number;
  arenaClockStartAt?: number;
};

function parseWorkerEvent(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function handler(rawEvent: unknown): Promise<void> {
  const eventBody = parseWorkerEvent(rawEvent);
  const payload = parseArenaFlagPayload(eventBody);
  if (!payload) {
    console.log(JSON.stringify({
      arenaFlagWorker: 'reject',
      reason: 'invalid_payload',
      raw: eventBody,
    }));
    return;
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    console.log(JSON.stringify({
      arenaFlagWorker: 'reject',
      reason: 'missing_table_env',
      payload,
    }));
    return;
  }

  let game: GameRow | undefined;
  try {
    const data = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk: 'GAME',
        sk: `${payload.metaGame}#0#${payload.gameId}`,
      },
    }));
    game = data.Item
      ? hydrateGameState(data.Item as GameRow) as GameRow
      : undefined;
  } catch (err) {
    console.log(JSON.stringify({
      arenaFlagWorker: 'error',
      reason: 'get_game_failed',
      payload,
      message: err instanceof Error ? err.message : String(err),
    }));
    throw err;
  }

  const skip = shouldSkipArenaFlagWorker(payload, game ?? null);
  if (skip.skip) {
    if (
      skip.reason === 'stale_generation'
      && game
      && isArenaGame(game)
      && game.toMove !== ''
      && game.toMove !== undefined
    ) {
      const now = Date.now();
      const timedOutIndex = arenaTimedOutPlayerIndex(
        {
          players: game.players,
          toMove: game.toMove,
          lastMoveTime: game.lastMoveTime,
          arenaClockStartAt: game.arenaClockStartAt,
        },
        now,
      );
      if (timedOutIndex !== null) {
        await timeloss(false, timedOutIndex, game.id, game.metaGame, now);
        await deleteArenaFlagForGame(game.id);
        console.log(JSON.stringify({
          arenaFlagWorker: 'timeloss',
          reason: 'stale_generation_overdue',
          payload,
          timedOutIndex,
        }));
        return;
      }
      try {
        await rescheduleArenaFlagForGame({
          id: game.id,
          metaGame: game.metaGame,
          clockGeneration: game.clockGeneration,
          players: game.players,
          toMove: game.toMove,
          lastMoveTime: game.lastMoveTime,
        }, now);
        console.log(JSON.stringify({
          arenaFlagWorker: 'rearm',
          reason: 'stale_generation',
          payload,
        }));
      } catch (err) {
        console.log(JSON.stringify({
          arenaFlagWorker: 'error',
          reason: 'stale_rearm_failed',
          payload,
          message: err instanceof Error ? err.message : String(err),
        }));
        throw err;
      }
      return;
    }
    console.log(JSON.stringify({
      arenaFlagWorker: 'noop',
      reason: skip.reason,
      payload,
      gameClockGeneration: game?.clockGeneration,
    }));
    return;
  }

  if (!game || !isArenaGame(game)) {
    console.log(JSON.stringify({
      arenaFlagWorker: 'noop',
      reason: 'not_arena_game',
      payload,
    }));
    return;
  }

  const now = Date.now();
  const timedOutIndex = arenaTimedOutPlayerIndex(
    {
      players: game.players,
      toMove: game.toMove,
      lastMoveTime: game.lastMoveTime,
      arenaClockStartAt: game.arenaClockStartAt,
    },
    now,
  );

  if (timedOutIndex === null) {
    console.log(JSON.stringify({
      arenaFlagWorker: 'rearm',
      reason: 'not_flagged_yet',
      payload,
    }));
    try {
      await rescheduleArenaFlagForGame({
        id: game.id,
        metaGame: game.metaGame,
        clockGeneration: game.clockGeneration,
        players: game.players,
        toMove: game.toMove,
        lastMoveTime: game.lastMoveTime,
      }, now);
    } catch (err) {
      console.log(JSON.stringify({
        arenaFlagWorker: 'error',
        reason: 'rearm_failed',
        payload,
        message: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
    return;
  }

  await timeloss(false, timedOutIndex, payload.gameId, payload.metaGame, now);
  await deleteArenaFlagForGame(payload.gameId);

  console.log(JSON.stringify({
    arenaFlagWorker: 'timeloss',
    payload,
    timedOutIndex,
  }));
}
