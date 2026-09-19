import { describe, expect, it } from 'vitest';
import { isActiveDashboardGame } from './activeGamesForUser.js';

describe('isActiveDashboardGame', () => {
  it('is active when toMove is set', () => {
    expect(isActiveDashboardGame({ toMove: '0' })).toBe(true);
    expect(isActiveDashboardGame({ toMove: [true, false] })).toBe(true);
  });

  it('is not active when toMove is empty or missing', () => {
    expect(isActiveDashboardGame({ toMove: '' })).toBe(false);
    expect(isActiveDashboardGame({})).toBe(false);
    expect(isActiveDashboardGame({ toMove: null })).toBe(false);
  });
});
