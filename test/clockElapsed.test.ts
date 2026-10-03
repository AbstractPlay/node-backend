import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  effectiveElapsedMs,
  isPlayerOnClock,
  overlapMs,
  remainingBankMs,
  wouldTimeOut,
  type ClockGameSlice,
} from '../lib/clockElapsed.js';
import type { VacationWindow } from '../lib/vacation/types.js';

const T0 = 1_000_000;
const HOUR = 3_600_000;

function game(overrides: Partial<ClockGameSlice> = {}): ClockGameSlice {
  return {
    players: [
      { id: 'alice', time: 2 * HOUR },
      { id: 'bob', time: 2 * HOUR },
    ],
    toMove: '0',
    lastMoveTime: T0,
    ...overrides,
  };
}

describe('overlapMs', () => {
  it('computes intersection length', () => {
    assert.equal(overlapMs(0, 100, 50, 150), 50);
    assert.equal(overlapMs(0, 50, 100, 200), 0);
  });
});

describe('isPlayerOnClock', () => {
  it('handles string toMove', () => {
    assert.equal(isPlayerOnClock(game({ toMove: '1' }), 1), true);
    assert.equal(isPlayerOnClock(game({ toMove: '1' }), 0), false);
  });

  it('handles simultaneous toMove', () => {
    const g = game({ toMove: [true, false] });
    assert.equal(isPlayerOnClock(g, 0), true);
    assert.equal(isPlayerOnClock(g, 1), false);
  });
});

describe('effectiveElapsedMs', () => {
  const pause: VacationWindow = { pauseStart: T0 + HOUR, pauseEnd: T0 + 3 * HOUR };

  it('subtracts vacation overlap for on-clock player', () => {
    const elapsed = effectiveElapsedMs({
      lastMoveTime: T0,
      endTime: T0 + 4 * HOUR,
      playerId: 'alice',
      game: game(),
      vacationWindow: pause,
    });
    assert.equal(elapsed, 2 * HOUR);
  });

  it('does not pause opponent bank when not on clock', () => {
    const elapsed = effectiveElapsedMs({
      lastMoveTime: T0,
      endTime: T0 + 4 * HOUR,
      playerId: 'bob',
      game: game(),
      vacationWindow: pause,
    });
    assert.equal(elapsed, 4 * HOUR);
  });

  it('pauses only after turn starts during vacation', () => {
    const turnStart = T0 + 2 * HOUR;
    const g = game({ lastMoveTime: turnStart, toMove: '0' });
    const elapsed = effectiveElapsedMs({
      lastMoveTime: turnStart,
      endTime: T0 + 4 * HOUR,
      playerId: 'alice',
      game: g,
      vacationWindow: pause,
    });
    assert.equal(elapsed, HOUR);
  });

  it('without vacation uses full wall time', () => {
    const elapsed = effectiveElapsedMs({
      lastMoveTime: T0,
      endTime: T0 + HOUR,
      playerId: 'alice',
      game: game(),
      vacationWindow: null,
    });
    assert.equal(elapsed, HOUR);
  });
});

describe('wouldTimeOut', () => {
  it('is false when vacation covers elapsed wall overtime', () => {
    const g = game({ lastMoveTime: T0 });
    const bank = HOUR;
    const pause: VacationWindow = { pauseStart: T0, pauseEnd: T0 + 5 * HOUR };
    assert.equal(
      wouldTimeOut({
        bank,
        lastMoveTime: T0,
        now: T0 + 2 * HOUR,
        playerId: 'alice',
        game: g,
        vacationWindow: pause,
      }),
      false,
    );
  });

  it('is true without vacation when wall time exceeds bank', () => {
    assert.equal(
      wouldTimeOut({
        bank: HOUR,
        lastMoveTime: T0,
        now: T0 + 2 * HOUR,
        playerId: 'alice',
        game: game(),
        vacationWindow: null,
      }),
      true,
    );
  });
});

describe('remainingBankMs', () => {
  it('matches bank minus effective elapsed', () => {
    const remaining = remainingBankMs(
      2 * HOUR,
      T0,
      T0 + HOUR,
      'alice',
      game(),
      null,
    );
    assert.equal(remaining, HOUR);
  });
});
