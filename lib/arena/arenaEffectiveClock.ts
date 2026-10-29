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
 * Origin for elapsed-time math: frozen before countdown ends, then `arenaClockStartAt`.
 */
export function arenaClockTickOrigin(game: ArenaClockFields, nowMs: number): number {
  if (game.arenaClockStartAt !== undefined) {
    return game.arenaClockStartAt;
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
