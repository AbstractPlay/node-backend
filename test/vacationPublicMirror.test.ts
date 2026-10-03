import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildPlayerAboutVacation,
} from '../lib/vacation/publicMirror.js';
import { VACATION_QUOTA_MS } from '../lib/vacation/constants.js';

const T0 = Date.parse('2026-06-15T12:00:00.000Z');
const HOUR = 3_600_000;

describe('vacation publicMirror', () => {
  it('buildPlayerAboutVacation is undefined without stint', () => {
    assert.equal(buildPlayerAboutVacation({}, T0), undefined);
  });

  it('buildPlayerAboutVacation includes scheduled future stint', () => {
    const v = buildPlayerAboutVacation(
      { vacationStartsAt: T0 + 2 * HOUR, vacationOpenEnded: true },
      T0,
    );
    assert.ok(v);
    assert.equal(v!.onVacation, false);
    assert.equal(v!.vacationScheduled, true);
    assert.equal(v!.vacationOpenEnded, true);
  });

  it('buildPlayerAboutVacation marks live open-ended stint', () => {
    const v = buildPlayerAboutVacation(
      {
        vacationStartsAt: T0,
        vacationStintStartedAt: T0,
        vacationOpenEnded: true,
        vacationPauseMsUsed: 0,
        vacationQuotaYear: 2026,
      },
      T0 + HOUR,
    );
    assert.ok(v);
    assert.equal(v!.onVacation, true);
    assert.equal(v!.vacationActive, true);
    assert.equal(v!.vacationQuotaMsRemaining, VACATION_QUOTA_MS);
  });
});
