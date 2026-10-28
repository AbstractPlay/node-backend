import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/ddb.js';
import {
  parseArenaFlagPayload,
  shouldSkipArenaFlagWorker,
} from '../lib/arena/flagPayload.js';

type GameClockRow = {
  pk: string;
  sk: string;
  playMode?: string;
  clockGeneration?: number;
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

  let game: GameClockRow | undefined;
  try {
    const data = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk: 'GAME',
        sk: `${payload.metaGame}#0#${payload.gameId}`,
      },
    }));
    game = data.Item as GameClockRow | undefined;
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
    console.log(JSON.stringify({
      arenaFlagWorker: 'noop',
      reason: skip.reason,
      payload,
      gameClockGeneration: game?.clockGeneration,
    }));
    return;
  }

  console.log(JSON.stringify({
    arenaFlagWorker: 'ready',
    payload,
    note: 'S0/S1 spike — timeloss not wired until arena kernel',
  }));
}
