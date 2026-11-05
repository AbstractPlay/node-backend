import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { completedTurnThinkTimeMs } from '../lib/clockElapsed.js';
import {
  applyCorrespondenceMoveBankMs,
  pieEvenOpponentRefundMs,
} from '../lib/games/correspondenceMoveClock.js';
import type { VacationWindow } from '../lib/vacation/types.js';

const T0 = 1_000_000;
const HOUR = 3_600_000;
const INC_MS = 9 * HOUR;
const MAX_MS = 120 * HOUR;

describe('correspondence invoke_pie think time on vacation', () => {
  const lastMoveTime = T0;
  const pieNow = T0 + 7 * HOUR;
  const vacation: VacationWindow = { pauseStart: T0, pauseEnd: T0 + 48 * HOUR };

  it('pie invoker on vacation: zero think time charged', () => {
    const timeUsed = completedTurnThinkTimeMs(lastMoveTime, pieNow, vacation);
    assert.equal(timeUsed, 0);
  });

  it('pie invoker bank gains increment only when on vacation', () => {
    const priorInvoker = 12 * HOUR;
    const timeUsed = completedTurnThinkTimeMs(lastMoveTime, pieNow, vacation);
    const invokerAfter = applyCorrespondenceMoveBankMs(
      priorInvoker,
      timeUsed,
      INC_MS,
      MAX_MS,
    );
    assert.equal(invokerAfter, priorInvoker + INC_MS);
  });

  it('pie-even opponent refund is zero when invoker think time is zero', () => {
    const timeUsed = completedTurnThinkTimeMs(lastMoveTime, pieNow, vacation);
    assert.equal(pieEvenOpponentRefundMs(timeUsed), 0);
  });

  it('without vacation, think time is wall and pie-even refund matches', () => {
    const timeUsed = completedTurnThinkTimeMs(lastMoveTime, pieNow, null);
    assert.equal(timeUsed, 7 * HOUR);
    assert.equal(pieEvenOpponentRefundMs(timeUsed), 7 * HOUR);
  });
});
