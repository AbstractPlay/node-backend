import { remainingBankMs, wouldTimeOut } from '../clockElapsed.js';
import { ARENA_CLOCK_GRACE_MS } from './constants.js';
import {
  arenaClockSliceForElapsed,
  isArenaCompetitiveClockLive,
  type ArenaClockFields,
} from './arenaEffectiveClock.js';

/** Player index to flag at `nowMs`, or null if no seat is past grace yet. */
export function arenaTimedOutPlayerIndex(
  game: ArenaClockFields,
  nowMs: number,
): number | null {
  if (!isArenaCompetitiveClockLive(game, nowMs)) {
    return null;
  }
  const slice = arenaClockSliceForElapsed(game, nowMs);
  const { toMove } = slice;
  if (toMove === undefined || toMove === '' || toMove === null) {
    return null;
  }

  const checkPlayer = (idx: number): boolean => {
    const player = slice.players[idx];
    if (!player) {
      return false;
    }
    const remaining = remainingBankMs(
      player.time ?? 0,
      slice.lastMoveTime,
      nowMs,
      player.id,
      slice,
      null,
    );
    return remaining <= -ARENA_CLOCK_GRACE_MS;
  };

  if (Array.isArray(toMove)) {
    for (let i = 0; i < toMove.length; i++) {
      if (toMove[i] && checkPlayer(i)) {
        return i;
      }
    }
    return null;
  }

  const idx = Number.parseInt(String(toMove), 10);
  if (!Number.isFinite(idx)) {
    return null;
  }
  const player = slice.players[idx];
  if (!player) {
    return null;
  }
  if (wouldTimeOut({
    bank: player.time ?? 0,
    lastMoveTime: slice.lastMoveTime,
    now: nowMs,
    playerId: player.id,
    game: slice,
    vacationWindow: null,
  }) && remainingBankMs(
    player.time ?? 0,
    slice.lastMoveTime,
    nowMs,
    player.id,
    slice,
    null,
  ) <= -ARENA_CLOCK_GRACE_MS) {
    return idx;
  }
  return null;
}

export function isArenaMoveOutOfTime(
  game: ArenaClockFields,
  submitterId: string,
  moveReceivedAt: number,
): boolean {
  if (!isArenaCompetitiveClockLive(game, moveReceivedAt)) {
    return false;
  }
  const slice = arenaClockSliceForElapsed(game, moveReceivedAt);
  const idx = slice.players.findIndex((p) => p.id === submitterId);
  if (idx < 0 || !slice.toMove) {
    return true;
  }
  if (Array.isArray(slice.toMove)) {
    if (!slice.toMove[idx]) {
      return true;
    }
  } else if (String(slice.toMove) !== String(idx)) {
    return true;
  }
  const player = slice.players[idx]!;
  const bank = player.time ?? 0;
  const nominalFlagAt = bank <= 0 ? slice.lastMoveTime : slice.lastMoveTime + bank;
  return moveReceivedAt > nominalFlagAt + ARENA_CLOCK_GRACE_MS;
}
