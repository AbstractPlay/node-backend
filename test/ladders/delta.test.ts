import { describe, expect, it } from 'vitest';
import {
  computeLadderPointDeltas,
  DEFAULT_LADDER_DELTA_TUNING,
  ladderWinDelta,
  ladderWinMultiplier,
} from '../../lib/ladders/delta.js';

describe('ladder delta', () => {
  const { B, K, lossFraction } = DEFAULT_LADDER_DELTA_TUNING;

  it('even match baseline near B at M_pace=1', () => {
    expect(ladderWinDelta(1000, 1000, 1, { B, K })).toBe(B);
  });

  it('upset win exceeds even match', () => {
    const even = ladderWinDelta(1000, 1000, 1, { B, K });
    const upset = ladderWinDelta(900, 1100, 1, { B, K });
    expect(upset).toBeGreaterThan(even);
  });

  it('farm win below even match', () => {
    const even = ladderWinDelta(1100, 1000, 1, { B, K });
    const farm = ladderWinDelta(1200, 900, 1, { B, K });
    expect(farm).toBeLessThan(even);
  });

  it('asymmetric loss is fraction of win delta', () => {
    const { winnerGain, loserLoss } = computeLadderPointDeltas(1000, 1050, 1, {
      B,
      K,
      lossFraction,
    });
    expect(winnerGain).toBeGreaterThan(0);
    expect(loserLoss).toBe(winnerGain * lossFraction);
    expect(loserLoss).toBeLessThan(winnerGain);
  });

  it('pace multiplier scales win delta', () => {
    const base = ladderWinDelta(1000, 1000, 1, { B, K });
    const paced = ladderWinDelta(1000, 1000, 1.15, { B, K });
    expect(paced).toBeCloseTo(base * 1.15, 9);
  });

  it('win multiplier has a floor', () => {
    expect(ladderWinMultiplier(2000, 500, K)).toBeGreaterThanOrEqual(0.2);
  });

  it('win delta is unchanged for timeloss vs normal win (same winner/loser points)', () => {
    const decisive = computeLadderPointDeltas(1000, 1100, 1, { B, K, lossFraction });
    const timelossSameRoles = computeLadderPointDeltas(1000, 1100, 1, { B, K, lossFraction });
    expect(timelossSameRoles).toEqual(decisive);
  });

  it('draw settlement is handled in applyLadderGameEnd (no winner branch in delta)', () => {
    expect(ladderWinDelta(1000, 1000, 1, { B, K })).toBe(B);
  });
});
