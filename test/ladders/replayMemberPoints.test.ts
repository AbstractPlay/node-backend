import { describe, expect, it } from 'vitest';
import { replayLadderPointsFromGames } from '../../lib/ladders/replayMemberPoints.js';
import { DEFAULT_LADDER_TUNING } from '../../lib/ladders/types.js';

describe('replayLadderPointsFromGames', () => {
  it('applies winner/loser deltas in settledAt order', () => {
    const seeds = new Map([
      ['a', 500],
      ['b', 500],
    ]);
    const points = replayLadderPointsFromGames(seeds, DEFAULT_LADDER_TUNING, [
      {
        gameId: 'g1',
        settledAt: 1000,
        winner: [1],
        players: [{ id: 'a' }, { id: 'b' }],
        gameStarted: 0,
        gameEnded: 1000,
        numMoves: 10,
      },
    ]);
    expect(points.get('a')!).toBeGreaterThan(500);
    expect(points.get('b')!).toBeLessThan(500);
  });
});
