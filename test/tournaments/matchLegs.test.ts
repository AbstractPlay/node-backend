import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  normalizeMatchLegs,
  parseMatchLegsParam,
  tournamentSeriesCounterSk,
  validateMatchLegsParam,
} from '../../lib/tournaments/matchLegs.js';

describe('matchLegs', () => {
  it('normalizes to 1 or 2', () => {
    assert.equal(normalizeMatchLegs(undefined), 1);
    assert.equal(normalizeMatchLegs(2), 2);
    assert.equal(normalizeMatchLegs(99), 1);
  });

  it('validates new_tournament param', () => {
    assert.equal(validateMatchLegsParam(1), undefined);
    assert.equal(validateMatchLegsParam(2), undefined);
    assert.equal(validateMatchLegsParam(3), 'matchLegs must be 1 or 2');
    assert.equal(parseMatchLegsParam(2), 2);
    assert.equal(parseMatchLegsParam(undefined), undefined);
  });

  it('builds separate counter keys for single- and two-leg series', () => {
    assert.equal(tournamentSeriesCounterSk('abande', []), 'abande#');
    assert.equal(tournamentSeriesCounterSk('abande', [], 2), 'abande##2');
    assert.equal(tournamentSeriesCounterSk('abande', ['v1', 'v2']), 'abande#v1|v2');
    assert.equal(tournamentSeriesCounterSk('abande', ['v2', 'v1'], 2), 'abande#v1|v2#2');
  });
});
