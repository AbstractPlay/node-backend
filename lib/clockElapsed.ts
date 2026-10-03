import type { VacationWindow } from './vacation/types.js';

export type ClockGameSlice = {
  players: { id: string; time?: number }[];
  toMove?: string | boolean[];
  lastMoveTime: number;
};

export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

export function isPlayerOnClock(game: ClockGameSlice, playerIndex: number): boolean {
  const { toMove } = game;
  if (toMove === undefined || toMove === '' || toMove === null) {
    return false;
  }
  if (Array.isArray(toMove)) {
    return playerIndex >= 0
      && playerIndex < toMove.length
      && toMove[playerIndex] === true;
  }
  return String(toMove) === String(playerIndex);
}

export function playerIndexById(game: ClockGameSlice, playerId: string): number {
  return game.players.findIndex(p => p.id === playerId);
}

export type EffectiveElapsedInput = {
  lastMoveTime: number;
  endTime: number;
  playerId: string;
  game: ClockGameSlice;
  vacationWindow: VacationWindow | null;
};

export function effectiveElapsedMs(input: EffectiveElapsedInput): number {
  const { lastMoveTime, endTime, playerId, game, vacationWindow } = input;
  const wall = endTime - lastMoveTime;
  if (wall <= 0) {
    return 0;
  }
  const idx = playerIndexById(game, playerId);
  if (idx < 0 || !isPlayerOnClock(game, idx)) {
    return wall;
  }
  if (vacationWindow === null) {
    return wall;
  }
  const pause = overlapMs(
    lastMoveTime,
    endTime,
    vacationWindow.pauseStart,
    vacationWindow.pauseEnd,
  );
  return wall - pause;
}

export function remainingBankMs(
  bank: number,
  lastMoveTime: number,
  endTime: number,
  playerId: string,
  game: ClockGameSlice,
  vacationWindow: VacationWindow | null,
): number {
  const elapsed = effectiveElapsedMs({
    lastMoveTime,
    endTime,
    playerId,
    game,
    vacationWindow,
  });
  return bank - elapsed;
}

export type WouldTimeOutInput = {
  bank: number;
  lastMoveTime: number;
  now: number;
  playerId: string;
  game: ClockGameSlice;
  vacationWindow: VacationWindow | null;
};

export function wouldTimeOut(input: WouldTimeOutInput): boolean {
  return remainingBankMs(
    input.bank,
    input.lastMoveTime,
    input.now,
    input.playerId,
    input.game,
    input.vacationWindow,
  ) < 0;
}
