export const GLICKO_RATING_START = 1200;
export const GLICKO_RD_START = 350;
export const GLICKO_VOLATILITY_START = 0.06;
export const GLICKO_PRIOR_RATING_LOW = GLICKO_RATING_START - 2 * GLICKO_RD_START;

export type GlickoStats = {
  rating: number;
  rd: number;
  volatility: number;
  ratingLow: number;
  ratingHigh: number;
  provisional: boolean;
  established: boolean;
  n: number;
};

export type UserGameRating = {
  user: string;
  game: string;
  rating: number;
  wld: [number, number, number];
  glicko?: GlickoStats;
};

function toGlickoStats(rating: number, rd: number, volatility: number, n: number): GlickoStats {
  const ratingLow = rating - 2 * rd;
  const ratingHigh = rating + 2 * rd;
  return {
    rating,
    rd,
    volatility,
    ratingLow,
    ratingHigh,
    provisional: n < 10 || rd > 200,
    established: n >= 20 && rd <= 110,
    n,
  };
}

/** Display name + variant UIDs → summarize `highest[].game` key. */
export function batchRatingGameLabel(displayName: string, variants: string[]): string {
  if (variants.length === 0) {
    return `${displayName} (no variants)`;
  }
  const sorted = [...variants].sort();
  return `${displayName} (${sorted.join('|')})`;
}

export function defaultGlickoPrior(): GlickoStats {
  return toGlickoStats(GLICKO_RATING_START, GLICKO_RD_START, GLICKO_VOLATILITY_START, 0);
}

export function lookupBatchRating(
  highest: UserGameRating[],
  displayName: string,
  variants: string[],
  userId: string,
): UserGameRating {
  const game = batchRatingGameLabel(displayName, variants);
  const row = highest.find((r) => r.user === userId && r.game === game);
  if (row !== undefined) {
    return row;
  }
  return {
    user: userId,
    game,
    rating: GLICKO_RATING_START,
    wld: [0, 0, 0],
    glicko: defaultGlickoPrior(),
  };
}

export function glickoConservativeSortKey(row: UserGameRating): number {
  return row.glicko?.ratingLow ?? GLICKO_PRIOR_RATING_LOW;
}

export type TournamentSeedPlayer = {
  playerid: string;
  rating?: number;
  score?: number;
};

export function assignTournamentPlayerRatings(
  players: TournamentSeedPlayer[],
  highest: UserGameRating[],
  displayName: string,
  variants: string[],
): void {
  for (const player of players) {
    const row = lookupBatchRating(highest, displayName, variants, player.playerid);
    player.rating = glickoConservativeSortKey(row);
    player.score = 0;
  }
}

/** Sort key: `ratingLow` desc → lower `rd` → higher raw `glicko.rating`. */
export function compareBatchRatings(a: UserGameRating, b: UserGameRating): number {
  const lowA = a.glicko?.ratingLow ?? GLICKO_PRIOR_RATING_LOW;
  const lowB = b.glicko?.ratingLow ?? GLICKO_PRIOR_RATING_LOW;
  if (lowB !== lowA) {
    return lowB - lowA;
  }
  const rdA = a.glicko?.rd ?? GLICKO_RD_START;
  const rdB = b.glicko?.rd ?? GLICKO_RD_START;
  if (rdA !== rdB) {
    return rdA - rdB;
  }
  const ratingA = a.glicko?.rating ?? GLICKO_RATING_START;
  const ratingB = b.glicko?.rating ?? GLICKO_RATING_START;
  return ratingB - ratingA;
}
