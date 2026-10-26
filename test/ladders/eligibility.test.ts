import { describe, expect, it } from 'vitest';
import { isWithinRematchCooldown } from '../../lib/ladders/pairHistory.js';
import {
  challengeReachBounds,
  isPointsWithinReach,
} from '../../lib/ladders/reach.js';
import { assertUnderLadderConcurrentCap } from '../../lib/ladders/eligibility.js';
import { DEFAULT_LADDER_TUNING } from '../../lib/ladders/types.js';
import type { LadderPlayerRecord } from '../../lib/ladders/types.js';

describe('ladder reach', () => {
  it('computes ±20% band at 1000 points', () => {
    expect(challengeReachBounds(1000, 20)).toEqual({ low: 800, high: 1200 });
    expect(isPointsWithinReach(1000, 900, 20)).toBe(true);
    expect(isPointsWithinReach(1000, 1300, 20)).toBe(false);
  });
});

describe('rematch cooldown', () => {
  const now = Date.UTC(2026, 0, 15);
  it('blocks within cooldown window', () => {
    const last = now - 3 * 86_400_000;
    expect(isWithinRematchCooldown(last, 7, now)).toBe(true);
  });
  it('allows after cooldown', () => {
    const last = now - 8 * 86_400_000;
    expect(isWithinRematchCooldown(last, 7, now)).toBe(false);
  });
});

describe('concurrent cap', () => {
  const player: LadderPlayerRecord = {
    pk: 'LADDERPLAYER',
    sk: 'l1#u1',
    ladderId: 'l1',
    userid: 'u1',
    points: 500,
    membershipStatus: 'active',
    joinedAt: 0,
    lastLadderActivityAt: 0,
    activeLadderGameCount: 7,
    startingPoints: 500,
    startingPointsSource: 'initial_points_default',
    startingPointsRecordedAt: 0,
    startingLadderStatus: 'forming',
  };
  it('rejects at max concurrent games', () => {
    expect(assertUnderLadderConcurrentCap(player, DEFAULT_LADDER_TUNING, 'caller')).toBe('caller_at_cap');
  });
});
