import { afterEach, describe, expect, it } from 'vitest';
import { GLICKO_PRIOR_RATING_LOW } from '../../lib/batchRatings.js';
import { resolveLadderJoinSeed } from '../../lib/ladders/startingPoints.js';
import {
  clearSummaryRatingsCacheForTests,
  setSummaryRatingsCacheForTests,
} from '../../lib/summaryRatings.js';

describe('resolveLadderJoinSeed', () => {
  afterEach(() => {
    clearSummaryRatingsCacheForTests();
  });

  it('uses Glicko ratingLow when summary row exists (meta UID game key)', async () => {
    setSummaryRatingsCacheForTests([
      {
        user: 'u1',
        game: 'amazons (#setup)',
        rating: 1400,
        wld: [1, 0, 0],
        glicko: {
          rating: 1380,
          rd: 55,
          volatility: 0.06,
          ratingLow: 1270,
          ratingHigh: 1490,
          provisional: false,
          established: true,
          n: 12,
        },
      },
    ]);
    const seed = await resolveLadderJoinSeed('amazons', [], 'u1', 'active');
    expect(seed.startingPointsSource).toBe('rating_low');
    expect(seed.points).toBe(1270);
    expect(seed.startingRatingLabel).toBe('amazons (#setup)');
  });

  it('falls back to prior when user has no rated games', async () => {
    setSummaryRatingsCacheForTests([
      {
        user: 'other',
        game: 'amazons (#setup)',
        rating: 1400,
        wld: [1, 0, 0],
        glicko: {
          rating: 1380,
          rd: 55,
          volatility: 0.06,
          ratingLow: 1270,
          ratingHigh: 1490,
          provisional: false,
          established: true,
          n: 12,
        },
      },
    ]);
    const seed = await resolveLadderJoinSeed('amazons', [], 'new-user', 'forming');
    expect(seed.startingPointsSource).toBe('initial_points_default');
    expect(seed.points).toBe(GLICKO_PRIOR_RATING_LOW);
  });
});
