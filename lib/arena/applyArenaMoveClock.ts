import {
  effectiveElapsedMs,
  type ClockGameSlice,
} from '../clockElapsed.js';
import type { ArenaClockSnapshot } from '../gamePlayMode.js';

export type ApplyArenaMoveClockInput = {
  moveReceivedAt: number;
  prevLastMoveTime: number;
  submitterId: string;
  players: { id: string; time?: number }[];
  toMoveAfterMove: ClockGameSlice['toMove'];
  arenaClock: ArenaClockSnapshot;
  autoMovesPerPlayer: number[];
};

export type ApplyArenaMoveClockResult = {
  players: { id: string; time?: number }[];
  lastMoveTime: number;
};

function incMs(arenaClock: ArenaClockSnapshot): number {
  return arenaClock.incSec * 1000;
}

function maxMs(arenaClock: ArenaClockSnapshot): number {
  return arenaClock.maxSec * 1000;
}

function clampBank(ms: number, arenaClock: ArenaClockSnapshot): number {
  const max = maxMs(arenaClock);
  if (ms > max) {
    return max;
  }
  return ms;
}

/** Fischer + automove increments — parity with correspondence playHandlers hour block. */
export function applyArenaMoveClock(input: ApplyArenaMoveClockInput): ApplyArenaMoveClockResult {
  const {
    moveReceivedAt,
    prevLastMoveTime,
    submitterId,
    arenaClock,
    autoMovesPerPlayer,
  } = input;
  const players = input.players.map((p) => ({ ...p, time: p.time ?? 0 }));
  const slice: ClockGameSlice = {
    players,
    toMove: input.toMoveAfterMove,
    lastMoveTime: prevLastMoveTime,
  };

  const submitter = players.find((p) => p.id === submitterId);
  if (!submitter) {
    throw new Error('Submitter not in game');
  }

  const timeUsed = effectiveElapsedMs({
    lastMoveTime: prevLastMoveTime,
    endTime: moveReceivedAt,
    playerId: submitterId,
    game: slice,
    vacationWindow: null,
  });

  const inc = incMs(arenaClock);
  if (submitter.time - timeUsed < 0) {
    submitter.time = inc;
  } else {
    submitter.time = submitter.time - timeUsed + inc;
  }
  submitter.time = clampBank(submitter.time, arenaClock);

  for (let i = 0; i < autoMovesPerPlayer.length; i++) {
    const n = autoMovesPerPlayer[i] ?? 0;
    if (n > 0 && players[i]) {
      players[i].time = clampBank((players[i].time ?? 0) + n * inc, arenaClock);
    }
  }

  return {
    players,
    lastMoveTime: moveReceivedAt,
  };
}
