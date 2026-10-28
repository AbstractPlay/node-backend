import {
  isPlayerOnClock,
  remainingBankMs,
  type ClockGameSlice,
} from '../clockElapsed.js';

export function enrichArenaGameClockDisplay<T extends ClockGameSlice>(
  game: T,
  now: number,
): T & { clockDisplayServerTime: number; players: (T['players'][number] & { effectiveRemainingMs?: number })[] } {
  const slice: ClockGameSlice = {
    players: game.players,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
  };
  const players = game.players.map((p, i) => {
    if (!isPlayerOnClock(slice, i)) {
      return { ...p };
    }
    const effectiveRemainingMs = remainingBankMs(
      p.time ?? 0,
      game.lastMoveTime,
      now,
      p.id,
      slice,
      null,
    );
    return { ...p, effectiveRemainingMs };
  });
  return {
    ...game,
    clockDisplayServerTime: now,
    players,
  };
}
