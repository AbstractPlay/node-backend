import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalPairKey,
  computePhase0Locks,
  paceQualificationRates,
  pairingWithinReach,
  percentile,
  perPlayerMeanHoursPerMove,
  pickPaceThresholdHours,
  reachAllowanceRates,
  stackHasTerminalFailure,
  summarizeDistribution,
} from '../../scripts/lib/ladder-calibration-stats.mjs';

describe('ladder-calibration-stats', () => {
  it('percentile and summarizeDistribution', () => {
    const dist = summarizeDistribution([1, 2, 3, 4, 10]);
    assert.equal(dist.n, 5);
    assert.equal(dist.p50, 3);
    assert.equal(percentile([1, 2, 3, 4], 0), 1);
  });

  it('canonicalPairKey is order-independent', () => {
    assert.equal(canonicalPairKey('b', 'a'), 'a:b');
    assert.equal(canonicalPairKey('a', 'b'), 'a:b');
  });

  it('paceQualificationRates both-under threshold', () => {
    const rates = paceQualificationRates([[10, 11], [5, 20]], [12, 24]);
    assert.equal(rates['12'].bothPlayersUnder, 0.5);
    assert.equal(rates['24'].bothPlayersUnder, 1);
  });

  it('perPlayerMeanHoursPerMove from synthetic stack', () => {
    const h = 3_600_000;
    const stack = [
      { _timestamp: new Date(0).toISOString() },
      { _timestamp: new Date(h).toISOString() },
      { _timestamp: new Date(2 * h).toISOString() },
      { _timestamp: new Date(3 * h).toISOString() },
    ];
    const means = perPlayerMeanHoursPerMove(stack, 2);
    assert.deepEqual(means, [1, 1]);
  });

  it('stackHasTerminalFailure detects timeout move', () => {
    assert.equal(stackHasTerminalFailure([{ move: 'e4' }, { move: 'timeout' }]), true);
    assert.equal(stackHasTerminalFailure([{ move: 'e4' }]), false);
  });

  it('pairingWithinReach uses midpoint', () => {
    assert.equal(pairingWithinReach(1000, 1100, 0.2), true);
    assert.equal(pairingWithinReach(1000, 1300, 0.2), false);
  });

  it('pickPaceThresholdHours targets band', () => {
    const q = {
      12: { bothPlayersUnder: 0.3 },
      24: { bothPlayersUnder: 0.6 },
    };
    assert.equal(pickPaceThresholdHours(q, [12, 24]), 12);
  });

  it('computePhase0Locks returns pilot series', () => {
    const locks = computePhase0Locks({
      exportUid: 'test-export',
      site: {
        rematchGapDaysBetweenRated2pGames: { p25: 6 },
        idleDaysWithZeroActiveRated2pGames: { p50: 40 },
        activeRated2pGameCountPerUser: { p75: 7 },
        glickoReachAllowance: { 20: 0.7 },
      },
      bySeries: {
        amazons: {
          paceQualification: { 12: { bothPlayersUnder: 0.3 } },
        },
      },
      paceThresholds: [12, 24],
      pilotSeriesKeys: ['amazons', 'tintas'],
    });
    assert.equal(locks.pilotLadderSeries[0], 'amazons');
    assert.equal(locks.rematchCooldownDays, 7);
    assert.equal(locks.B, 12);
    assert.equal(locks.lossFraction, 0.8);
  });
});
