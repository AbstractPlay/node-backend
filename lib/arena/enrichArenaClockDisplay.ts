import {
  isPlayerOnClock,
  remainingBankMs,
  type ClockGameSlice,
} from '../clockElapsed.js';
import {
  arenaClockSliceForElapsed,
  type ArenaClockFields,
} from './arenaEffectiveClock.js';

export function enrichArenaGameClockDisplay<T extends ArenaClockFields>(
  game: T,
  now: number,
): T & { clockDisplayServerTime: number; players: (T['players'][number] & { effectiveRemainingMs?: number })[] } {
  const slice = arenaClockSliceForElapsed(game, now);
  const players = game.players.map((p, i) => {
    if (!isPlayerOnClock(slice, i)) {
      return { ...p };
    }
    const effectiveRemainingMs = remainingBankMs(
      p.time ?? 0,
      slice.lastMoveTime,
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
