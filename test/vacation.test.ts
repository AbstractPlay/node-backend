import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { VACATION_BLOCK_MS, VACATION_QUOTA_MS } from '../lib/vacation/constants.js';
import {
  planCancelScheduled,
  planFinalizeStint,
  planStopVacation,
} from '../lib/vacation/finalize.js';
import {
  buildVacationSnapshot,
  computeStintPauseMs,
  isVacationStintLive,
  remainingQuotaMs,
  resolveVacationWindow,
  shouldAutoFinalizeStint,
  utcQuotaYear,
} from '../lib/vacation/resolve.js';
import type { VacationUserFields } from '../lib/vacation/types.js';
import {
  validateSchedule,
  validateStop,
  validateUpdate,
} from '../lib/vacation/validate.js';

const T0 = Date.parse('2026-06-15T12:00:00.000Z');
const HOUR = 3_600_000;

function fields(overrides: VacationUserFields = {}): VacationUserFields {
  return {
    vacationQuotaYear: 2026,
    vacationPauseMsUsed: 0,
    ...overrides,
  };
}

describe('vacation resolve', () => {
  it('returns null before scheduled start', () => {
    const f = fields({ vacationStartsAt: T0 + HOUR, vacationOpenEnded: true });
    assert.equal(resolveVacationWindow(f, T0), null);
    assert.equal(buildVacationSnapshot(f, T0).vacationScheduled, true);
  });

  it('pauses after immediate open-ended start', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationOpenEnded: true,
    });
    const w = resolveVacationWindow(f, T0 + HOUR);
    assert.ok(w);
    assert.equal(w!.pauseStart, T0);
    assert.equal(w!.pauseEnd, T0 + VACATION_QUOTA_MS);
  });

  it('caps open-ended pause at remaining quota', () => {
    const used = VACATION_QUOTA_MS - 2 * HOUR;
    const f = fields({
      vacationPauseMsUsed: used,
      vacationQuotaYear: 2026,
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationOpenEnded: true,
    });
    const w = resolveVacationWindow(f, T0 + HOUR);
    assert.ok(w);
    assert.equal(w!.pauseEnd, T0 + 2 * HOUR);
  });

  it('fixed end window ends at vacationEndsAt', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationEndsAt: T0 + 5 * HOUR,
      vacationOpenEnded: false,
    });
    const w = resolveVacationWindow(f, T0 + HOUR);
    assert.ok(w);
    assert.equal(w!.pauseEnd, T0 + 5 * HOUR);
  });

  it('returns null after fixed end passed', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationEndsAt: T0 + 2 * HOUR,
    });
    assert.equal(resolveVacationWindow(f, T0 + 3 * HOUR), null);
    assert.equal(shouldAutoFinalizeStint(f, T0 + 3 * HOUR), true);
  });

  it('resets used ms in snapshot when quota year rolls over', () => {
    const f = fields({
      vacationQuotaYear: 2025,
      vacationPauseMsUsed: VACATION_QUOTA_MS,
    });
    const snap = buildVacationSnapshot(f, T0);
    assert.equal(snap.vacationPauseMsUsed, 0);
    assert.equal(snap.vacationQuotaMsRemaining, VACATION_QUOTA_MS);
    assert.equal(snap.vacationQuotaYear, 2026);
  });

  it('computeStintPauseMs is exact wall ms', () => {
    assert.equal(computeStintPauseMs(T0, T0 + 90 * 60 * 1000), 90 * 60 * 1000);
  });

  it('stint live when started (independent of on-clock pause window)', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationOpenEnded: true,
    });
    assert.equal(isVacationStintLive(f, T0 + HOUR), true);
  });
});

describe('vacation finalize plans', () => {
  it('planStopVacation charges partial stint', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationOpenEnded: true,
    });
    const plan = planStopVacation(f, T0 + 36 * HOUR);
    assert.ok(plan);
    assert.equal(plan!.chargeMs, 36 * HOUR);
    assert.equal(plan!.vacationPauseMsUsed, 36 * HOUR);
    assert.equal(plan!.clearStintFields, true);
  });

  it('planCancelScheduled clears without charge', () => {
    const f = fields({ vacationStartsAt: T0 + HOUR, vacationOpenEnded: true });
    const plan = planCancelScheduled(f, T0);
    assert.ok(plan?.clearStintFields);
  });

  it('planFinalizeStint at fixed end charges through endsAt', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationEndsAt: T0 + 10 * HOUR,
    });
    const plan = planFinalizeStint(f, T0 + 12 * HOUR);
    assert.ok(plan);
    assert.equal(plan!.chargeMs, 10 * HOUR);
  });
});

describe('vacation validate', () => {
  it('rejects schedule when stint already exists', () => {
    const err = validateSchedule({
      startsAt: T0 + 2 * HOUR,
      openEnded: true,
      fields: fields({ vacationStartsAt: T0 + HOUR, vacationOpenEnded: true }),
      now: T0,
    });
    assert.equal(err, 'vacation_stint_active');
  });

  it('rejects fixed end beyond quota', () => {
    const err = validateSchedule({
      startsAt: T0,
      endsAt: T0 + VACATION_QUOTA_MS + HOUR,
      openEnded: false,
      fields: fields(),
      now: T0,
    });
    assert.equal(err, 'vacation_no_quota');
  });

  it('validateStop allows scheduled cancel', () => {
    const f = fields({ vacationStartsAt: T0 + HOUR, vacationOpenEnded: true });
    assert.equal(validateStop(f, T0), null);
  });

  it('validateUpdate rejects end in past', () => {
    const f = fields({
      vacationStartsAt: T0,
      vacationStintStartedAt: T0,
      vacationEndsAt: T0 + 5 * HOUR,
    });
    assert.equal(
      validateUpdate({ fields: f, now: T0 + 6 * HOUR, endsAt: T0 + 4 * HOUR }),
      'vacation_end_passed',
    );
  });
});

describe('utcQuotaYear', () => {
  it('uses UTC calendar year', () => {
    assert.equal(utcQuotaYear(Date.parse('2026-12-31T23:00:00.000Z')), 2026);
    assert.equal(utcQuotaYear(Date.parse('2027-01-01T00:00:00.000Z')), 2027);
  });
});

describe('remainingQuotaMs', () => {
  it('respects block-sized quota', () => {
    assert.equal(remainingQuotaMs(fields(), T0), 14 * VACATION_BLOCK_MS);
  });
});
