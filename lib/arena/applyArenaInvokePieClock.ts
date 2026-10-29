import { effectiveElapsedMs, type ClockGameSlice } from '../clockElapsed.js';
import type { ArenaClockSnapshot } from '../gamePlayMode.js';

export type ApplyArenaInvokePieClockInput = {
  moveReceivedAt: number;
  prevLastMoveTime: number;
  invokerId: string;
  players: { id: string; time?: number }[];
  toMove: ClockGameSlice['toMove'];
  arenaClock: ArenaClockSnapshot;
};

export type ApplyArenaInvokePieClockResult = {
  players: { id: string; time?: number }[];
  timeUsedMs: number;
};

function incMs(arenaClock: ArenaClockSnapshot): number {
  return arenaClock.incSec * 1000;
}

function clampBank(ms: number, arenaClock: ArenaClockSnapshot): number {
  const max = arenaClock.maxSec * 1000;
  if (ms > max) {
    return max;
  }
  return ms;
}

/**
 * Pie seat switch: debit invoker think time + Fischer increment (ms banks, no vacation).
 * Player objects keep their `time`; seat order is swapped separately.
 */
export function applyArenaInvokePieClock(
  input: ApplyArenaInvokePieClockInput,
): ApplyArenaInvokePieClockResult {
  const { moveReceivedAt, prevLastMoveTime, invokerId, arenaClock } = input;
  const players = input.players.map((p) => ({ ...p, time: p.time ?? 0 }));
  const slice: ClockGameSlice = {
    players,
    toMove: input.toMove,
    lastMoveTime: prevLastMoveTime,
  };

  const invoker = players.find((p) => p.id === invokerId);
  if (!invoker) {
    throw new Error('Invoker not in game');
  }

  const timeUsedMs = effectiveElapsedMs({
    lastMoveTime: prevLastMoveTime,
    endTime: moveReceivedAt,
    playerId: invokerId,
    game: slice,
    vacationWindow: null,
  });

  const inc = incMs(arenaClock);
  if (invoker.time - timeUsedMs < 0) {
    invoker.time = inc;
  } else {
    invoker.time = invoker.time - timeUsedMs + inc;
  }
  invoker.time = clampBank(invoker.time, arenaClock);

  return { players, timeUsedMs };
}

/** Non–pie-even: opponent refund while board state unchanged (correspondence parity). */
export function refundArenaPieOpponentThinkTime(
  players: { id: string; time?: number }[],
  opponentId: string,
  timeUsedMs: number,
  arenaClock: ArenaClockSnapshot,
): { id: string; time?: number }[] {
  const next = players.map((p) => ({ ...p, time: p.time ?? 0 }));
  const opponent = next.find((p) => p.id === opponentId);
  if (!opponent) {
    throw new Error('Opponent not in game');
  }
  opponent.time = clampBank(opponent.time + timeUsedMs, arenaClock);
  return next;
}
