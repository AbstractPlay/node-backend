import {
  GLICKO_PRIOR_RATING_LOW,
  lookupBatchRating,
} from '../batchRatings.js';
import { loadSummaryRatingsHighest } from '../summaryRatings.js';
import type { LadderStatus, StartingPointsSource } from './types.js';
import { DEFAULT_LADDER_TUNING } from './types.js';

export type JoinSeedSnapshot = {
  points: number;
  startingPoints: number;
  startingPointsSource: StartingPointsSource;
  startingRatingLabel?: string;
  startingRatingLow?: number;
  startingPointsRecordedAt: number;
  startingLadderStatus: LadderStatus;
};

export async function resolveLadderJoinSeed(
  metaGame: string,
  variants: string[],
  userid: string,
  ladderStatus: LadderStatus,
): Promise<JoinSeedSnapshot> {
  const highest = await loadSummaryRatingsHighest();
  const row = lookupBatchRating(highest, metaGame, variants, userid);
  const ratingLow = row.glicko?.ratingLow;
  const now = Date.now();
  if (ratingLow !== undefined && row.glicko !== undefined && row.glicko.n > 0) {
    const label = row.game;
    return {
      points: ratingLow,
      startingPoints: ratingLow,
      startingPointsSource: 'rating_low',
      startingRatingLabel: label,
      startingRatingLow: ratingLow,
      startingPointsRecordedAt: now,
      startingLadderStatus: ladderStatus,
    };
  }
  const points = DEFAULT_LADDER_TUNING.initialPointsDefault ?? GLICKO_PRIOR_RATING_LOW;
  return {
    points,
    startingPoints: points,
    startingPointsSource: 'initial_points_default',
    startingPointsRecordedAt: now,
    startingLadderStatus: ladderStatus,
  };
}
