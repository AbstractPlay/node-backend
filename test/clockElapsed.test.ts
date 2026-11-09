import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  completedTurnThinkTimeMs,
  effectiveElapsedMs,
  isPlayerOnClock,
  overlapMs,
  remainingBankMs,
  thinkTimeMsWithVacationOverlap,
  wouldTimeOut,
  type ClockGameSlice,
} from '../lib/clockElapsed.js';
import {
  applyCorrespondenceMoveBankMs,
} from '../lib/games/correspondenceMoveClock.js';
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

  it('returns full wall for mover after toMove flipped (live slice only)', () => {
    const pause: VacationWindow = { pauseStart: T0, pauseEnd: T0 + 24 * HOUR };
    const wall = 19 * HOUR;
    const elapsed = effectiveElapsedMs({
      lastMoveTime: T0,
      endTime: T0 + wall,
      playerId: 'alice',
      game: game({ toMove: '1' }),
      vacationWindow: pause,
    });
    assert.equal(elapsed, wall);
  });
});

describe('thinkTimeMsWithVacationOverlap', () => {
  const pause: VacationWindow = { pauseStart: T0 + HOUR, pauseEnd: T0 + 3 * HOUR };

  it('matches effectiveElapsed for on-clock player', () => {
    const end = T0 + 4 * HOUR;
    const shared = thinkTimeMsWithVacationOverlap(T0, end, pause);
    const live = effectiveElapsedMs({
      lastMoveTime: T0,
      endTime: end,
      playerId: 'alice',
      game: game(),
      vacationWindow: pause,
    });
    assert.equal(shared, live);
    assert.equal(shared, 2 * HOUR);
  });
});

describe('completedTurnThinkTimeMs', () => {
  const pause: VacationWindow = { pauseStart: T0, pauseEnd: T0 + 24 * HOUR };

  it('charges zero when vacation covers full turn interval', () => {
    assert.equal(
      completedTurnThinkTimeMs(T0, T0 + 19 * HOUR, pause),
      0,
    );
  });

  it('charges partial wall when vacation starts mid-turn', () => {
    const turnStart = T0 + 2 * HOUR;
    const pauseMid: VacationWindow = { pauseStart: T0 + HOUR, pauseEnd: T0 + 3 * HOUR };
    assert.equal(
      completedTurnThinkTimeMs(turnStart, T0 + 4 * HOUR, pauseMid),
      HOUR,
    );
  });

  it('charges full wall without vacation window', () => {
    assert.equal(completedTurnThinkTimeMs(T0, T0 + 5 * HOUR, null), 5 * HOUR);
  });
});

describe('correspondence move bank (Samraku-style)', () => {
  const INC = 9 * HOUR;
  const MAX = 120 * HOUR;
  const pause: VacationWindow = { pauseStart: T0, pauseEnd: T0 + 48 * HOUR };

  it('9h bank + 9h inc when vacation zeros think time (not soft-OT reset)', () => {
    const prior = 9 * HOUR;
    const wall = 19 * HOUR;
    const charged = completedTurnThinkTimeMs(T0, T0 + wall, pause);
    assert.equal(charged, 0);
    const next = applyCorrespondenceMoveBankMs(prior, charged, INC, MAX);
    assert.equal(next, 18 * HOUR);
  });

  it('soft OT when wall charged without vacation on low bank', () => {
    const prior = 9 * HOUR;
    const wall = 19 * HOUR;
    const charged = completedTurnThinkTimeMs(T0, T0 + wall, null);
    assert.equal(charged, wall);
    const next = applyCorrespondenceMoveBankMs(prior, charged, INC, MAX);
    assert.equal(next, INC);
  });
});

describe('ended vacation stints', () => {
  const endedStint: VacationWindow[] = [
    { pauseStart: T0 + HOUR, pauseEnd: T0 + 10 * HOUR },
  ];

  it('subtracts ended stint after vacation stops (no live window)', () => {
    const elapsed = thinkTimeMsWithVacationOverlap(
      T0,
      T0 + 12 * HOUR,
      endedStint,
    );
    assert.equal(elapsed, 3 * HOUR);
  });

  it('does not double-count overlapping ended stints', () => {
    const windows: VacationWindow[] = [
      { pauseStart: T0, pauseEnd: T0 + 2 * HOUR },
      { pauseStart: T0 + HOUR, pauseEnd: T0 + 3 * HOUR },
    ];
    const elapsed = thinkTimeMsWithVacationOverlap(T0, T0 + 4 * HOUR, windows);
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
