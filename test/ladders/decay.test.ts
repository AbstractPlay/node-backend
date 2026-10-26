import { describe, expect, it } from 'vitest';
import { computeDecayPoints, utcDayStartMs } from '../../lib/ladders/decay.js';

describe('ladder decay helpers', () => {
  it('utcDayStartMs returns UTC midnight for the given instant', () => {
    const ms = utcDayStartMs(Date.UTC(2026, 9, 26, 15, 30, 0));
    expect(ms).toBe(Date.UTC(2026, 9, 26, 0, 0, 0, 0));
  });

  it('computeDecayPoints applies daily rate and floors at zero', () => {
    expect(computeDecayPoints(0, 0.005)).toBe(0);
    expect(computeDecayPoints(1000, 0.005)).toBe(995);
    expect(computeDecayPoints(1, 0.005)).toBe(0);
  });
});
