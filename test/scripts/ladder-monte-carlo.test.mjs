import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeLadderPointDeltas } from '../../lib/ladders/delta.ts';
import {
  gridSearchDeltaTuning,
  replayLadderGames,
  scoreReplayForTuning,
} from '../../bin/lib/ladder-monte-carlo.mjs';

function computeDeltas(wPts, lPts, mPace, tuning) {
  return computeLadderPointDeltas(wPts, lPts, mPace, tuning);
}

describe('ladder-monte-carlo', () => {
  it('replay updates points and tracks even vs upset', () => {
    const games = [
      { winnerId: 'a', loserId: 'b', endedAt: 1, paceMultiplier: 1 },
      { winnerId: 'b', loserId: 'a', endedAt: 2, paceMultiplier: 1 },
    ];
    const replay = replayLadderGames(
      games,
      { B: 10, K: 0.001, lossFraction: 0.5 },
      computeDeltas,
      {
        initialPoints: new Map([['a', 1000], ['b', 1000]]),
        enforceReach: false,
      },
    );
    assert.equal(replay.gamesApplied, 2);
    assert.equal(replay.evenWinDeltas.length, 2);
  });

  it('grid search returns a best row', () => {
    const games = [];
    for (let i = 0; i < 40; i += 1) {
      const hi = i % 2 === 0 ? 'hi' : 'lo';
      const lo = hi === 'hi' ? 'lo' : 'hi';
      games.push({
        winnerId: lo,
        loserId: hi,
        endedAt: i,
        paceMultiplier: 1,
      });
    }
    const result = gridSearchDeltaTuning(games, computeDeltas, {
      replayOpts: {
        initialPoints: new Map([['hi', 1100], ['lo', 900]]),
        enforceReach: false,
      },
      BValues: [10, 12],
      KValues: [0.0008, 0.001],
      lossFractionValues: [0.5, 0.55],
    });
    assert.ok(result.best);
    assert.ok(result.best.score >= 0);
    assert.equal(result.combinationsTried, 8);
  });

  it('scoreReplay penalizes tiny win deltas', () => {
    const replay = {
      evenWinDeltas: [12],
      upsetWinDeltas: [14],
      farmWinDeltas: [8],
      winDeltas: [12, 14, 8, 0.5],
      gamesApplied: 4,
      netInflation: 4,
    };
    const metrics = scoreReplayForTuning(replay);
    assert.ok(metrics.score > 0);
  });
});
