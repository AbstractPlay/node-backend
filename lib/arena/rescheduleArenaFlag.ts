import {
  deleteArenaFlagSchedule,
  upsertArenaFlagSchedule,
} from './flagSchedule.js';
import { nominalArenaFlagAtMs } from './nominalFlagAt.js';
import type { ArenaFlagPayload } from './flagPayload.js';

export type ArenaGameScheduleSlice = {
  id: string;
  metaGame: string;
  clockGeneration?: number;
  players: { id: string; time?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
};

function stageFromEnv(): string {
  return process.env.WEBSOCKET_STAGE ?? process.env.SLS_STAGE ?? 'dev';
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

export async function rescheduleArenaFlagForGame(
  game: ArenaGameScheduleSlice,
  scheduleNowMs: number = Date.now(),
): Promise<void> {
  const stage = stageFromEnv();
  const workerArn = requireEnv('ARENA_FLAG_WORKER_ARN');
  const schedulerRoleArn = requireEnv('ARENA_SCHEDULER_ROLE_ARN');
  const generation = game.clockGeneration ?? 1;

  if (!game.toMove || game.toMove === '') {
    await deleteArenaFlagSchedule(stage, game.id);
    return;
  }

  const nominal = nominalArenaFlagAtMs(game);
  if (nominal === null) {
    await deleteArenaFlagSchedule(stage, game.id);
    return;
  }

  const payload: ArenaFlagPayload = {
    metaGame: game.metaGame,
    gameId: game.id,
    clockGeneration: generation,
  };

  await upsertArenaFlagSchedule({
    stage,
    workerArn,
    schedulerRoleArn,
    payload,
    nominalFlagAtMs: nominal,
    scheduleNowMs,
  });
}

export async function deleteArenaFlagForGame(gameId: string): Promise<void> {
  const stage = stageFromEnv();
  await deleteArenaFlagSchedule(stage, gameId);
}
