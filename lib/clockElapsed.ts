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

export type VacationClockInput = VacationWindow | VacationWindow[] | null;

export function vacationWindowsList(vacation: VacationClockInput | undefined): VacationWindow[] {
  if (vacation === null || vacation === undefined) {
    return [];
  }
  return Array.isArray(vacation) ? vacation : [vacation];
}

/** Merged overlap of vacation pause intervals with [intervalStart, intervalEnd]. */
export function vacationPauseMsInInterval(
  intervalStart: number,
  intervalEnd: number,
  windows: VacationWindow[],
): number {
  if (intervalEnd <= intervalStart || windows.length === 0) {
    return 0;
  }
  const clipped = windows
    .map(w => ({
      start: Math.max(w.pauseStart, intervalStart),
      end: Math.min(w.pauseEnd, intervalEnd),
    }))
    .filter(w => w.end > w.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const w of clipped) {
    if (curEnd < 0 || w.start > curEnd) {
      if (curEnd >= 0) {
        total += curEnd - curStart;
      }
      curStart = w.start;
      curEnd = w.end;
    } else {
      curEnd = Math.max(curEnd, w.end);
    }
  }
  if (curEnd >= 0) {
    total += curEnd - curStart;
  }
  return total;
}

export type EffectiveElapsedInput = {
  lastMoveTime: number;
  endTime: number;
  playerId: string;
  game: ClockGameSlice;
  vacationWindow: VacationClockInput;
};

export function thinkTimeMsWithVacationOverlap(
  lastMoveTime: number,
  endTime: number,
  vacationWindow: VacationClockInput,
): number {
  const wall = endTime - lastMoveTime;
  if (wall <= 0) {
    return 0;
  }
  const pause = vacationPauseMsInInterval(
    lastMoveTime,
    endTime,
    vacationWindowsList(vacationWindow),
  );
  return wall - pause;
}

/** Think time charged when a correspondence player completes a turn (move or pie). */
export function completedTurnThinkTimeMs(
  lastMoveTime: number,
  endTime: number,
  vacationWindow: VacationClockInput,
): number {
  return thinkTimeMsWithVacationOverlap(lastMoveTime, endTime, vacationWindow);
}

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
  return thinkTimeMsWithVacationOverlap(lastMoveTime, endTime, vacationWindow);
}

export function remainingBankMs(
  bank: number,
  lastMoveTime: number,
  endTime: number,
  playerId: string,
  game: ClockGameSlice,
  vacationWindow: VacationClockInput,
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
  vacationWindow: VacationClockInput;
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
