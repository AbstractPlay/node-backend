import { remainingBankMs, wouldTimeOut, type ClockGameSlice } from '../clockElapsed.js';
import { ARENA_CLOCK_GRACE_MS } from './constants.js';

/** Player index to flag at `nowMs`, or null if no seat is past grace yet. */
export function arenaTimedOutPlayerIndex(
  game: ClockGameSlice,
  nowMs: number,
): number | null {
  const { toMove } = game;
  if (toMove === undefined || toMove === '' || toMove === null) {
    return null;
  }

  const checkPlayer = (idx: number): boolean => {
    const player = game.players[idx];
    if (!player) {
      return false;
    }
    const remaining = remainingBankMs(
      player.time ?? 0,
      game.lastMoveTime,
      nowMs,
      player.id,
      game,
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
  const player = game.players[idx];
  if (!player) {
    return null;
  }
  if (wouldTimeOut({
    bank: player.time ?? 0,
    lastMoveTime: game.lastMoveTime,
    now: nowMs,
    playerId: player.id,
    game,
    vacationWindow: null,
  }) && remainingBankMs(
    player.time ?? 0,
    game.lastMoveTime,
    nowMs,
    player.id,
    game,
    null,
  ) <= -ARENA_CLOCK_GRACE_MS) {
    return idx;
  }
  return null;
}

export function isArenaMoveOutOfTime(
  game: ClockGameSlice,
  submitterId: string,
  moveReceivedAt: number,
): boolean {
  const idx = game.players.findIndex((p) => p.id === submitterId);
  if (idx < 0 || !game.toMove) {
    return true;
  }
  const slice = game;
  if (Array.isArray(game.toMove)) {
    if (!game.toMove[idx]) {
      return true;
    }
  } else if (String(game.toMove) !== String(idx)) {
    return true;
  }
  const player = game.players[idx]!;
  const bank = player.time ?? 0;
  const nominalFlagAt = bank <= 0 ? game.lastMoveTime : game.lastMoveTime + bank;
  return moveReceivedAt > nominalFlagAt + ARENA_CLOCK_GRACE_MS;
}
