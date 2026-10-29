import type { ClockGameSlice } from '../clockElapsed.js';

export type ArenaClockFields = ClockGameSlice & {
  arenaClockStartAt?: number;
};

/** True when Fischer time is running (after synchronized countdown). */
export function isArenaCompetitiveClockLive(
  game: Pick<ArenaClockFields, 'arenaClockStartAt'>,
  nowMs: number,
): boolean {
  return game.arenaClockStartAt !== undefined && nowMs >= game.arenaClockStartAt;
}

/**
 * Origin for elapsed-time math: frozen at `arenaClockStartAt` before countdown ends,
 * then the persisted `lastMoveTime` for Fischer ticks after each move.
 */
export function arenaClockTickOrigin(game: ArenaClockFields, nowMs: number): number {
  const startAt = game.arenaClockStartAt;
  if (startAt !== undefined && nowMs < startAt) {
    return startAt;
  }
  if (game.lastMoveTime !== undefined && game.lastMoveTime !== null) {
    return game.lastMoveTime;
  }
  return nowMs;
}

export function arenaClockSliceForElapsed(
  game: ArenaClockFields,
  nowMs: number,
): ClockGameSlice {
  return {
    players: game.players,
    toMove: game.toMove,
    lastMoveTime: arenaClockTickOrigin(game, nowMs),
  };
}
