import { describe, expect, it } from 'vitest';
import {
  challengeMatchesStandingEntry,
  stringArraysEqual,
  type StandingPresetEntry,
} from './standingChallengeMatch.js';

const baseEntry = (): StandingPresetEntry => ({
  id: 'preset-1',
  metaGame: 'chess',
  numPlayers: 2,
  variants: ['standard'],
  clockStart: 600,
  clockInc: 0,
  clockMax: 0,
  clockHard: false,
  rated: true,
  noExplore: false,
  limit: 1,
  sensitivity: 'variants',
  suspended: false,
});

describe('stringArraysEqual', () => {
  it('matches regardless of order', () => {
    expect(stringArraysEqual(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(stringArraysEqual(['a'], ['b'])).toBe(false);
  });
});

describe('challengeMatchesStandingEntry', () => {
  it('requires exact variants when sensitivity is variants', () => {
    const entry = baseEntry();
    expect(challengeMatchesStandingEntry({
      metaGame: 'chess',
      numPlayers: 2,
      variants: ['standard'],
      clockStart: 600,
      clockInc: 0,
      clockMax: 0,
      clockHard: false,
      rated: true,
      noExplore: false,
    }, entry)).toBe(true);
    expect(challengeMatchesStandingEntry({
      metaGame: 'chess',
      numPlayers: 2,
      variants: ['other'],
      clockStart: 600,
      clockInc: 0,
      clockMax: 0,
      clockHard: false,
      rated: true,
      noExplore: false,
    }, entry)).toBe(false);
  });

  it('matches meta sensitivity without variant equality', () => {
    const entry = { ...baseEntry(), sensitivity: 'meta' as const, variants: ['a'] };
    expect(challengeMatchesStandingEntry({
      metaGame: 'chess',
      numPlayers: 2,
      variants: ['b'],
      clockStart: 600,
      clockInc: 0,
      clockMax: 0,
      clockHard: false,
      rated: true,
      noExplore: false,
    }, entry)).toBe(true);
  });
});
