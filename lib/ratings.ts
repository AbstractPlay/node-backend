export type PlayerRating = {
  rating: number;
  N: number;
  wins: number;
  draws: number;
};

export const DEFAULT_PLAYER_RATING: PlayerRating = {
  rating: 1200,
  N: 0,
  wins: 0,
  draws: 0,
};

/** K-factor for rated games based on how many rated games the player has played. */
export function getRatingK(N: number): number {
  return (
    N < 10 ? 40
      : N < 20 ? 30
        : N < 40 ? 25
          : 20
  );
}

/** Player 1's expected score (0–1) in a two-player rated game. */
export function expectedScorePlayer1(rating1: number, rating2: number): number {
  return 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
}

/**
 * Apply the backend's two-player Elo update.
 * @param player1Score Player 1's result: 1 (win), 0.5 (draw), or 0 (loss).
 */
export function updateTwoPlayerRatings(
  rating1: PlayerRating,
  rating2: PlayerRating,
  player1Score: number,
): [PlayerRating, PlayerRating] {
  if (player1Score !== 0 && player1Score !== 0.5 && player1Score !== 1) {
    throw new Error(`player1Score must be 0, 0.5, or 1, got ${player1Score}`);
  }

  const r1: PlayerRating = { ...rating1 };
  const r2: PlayerRating = { ...rating2 };

  if (player1Score === 1) {
    r1.wins += 1;
  } else if (player1Score === 0) {
    r2.wins += 1;
  } else {
    r1.draws += 1;
    r2.draws += 1;
  }

  const expectedScore = expectedScorePlayer1(r1.rating, r2.rating);
  r1.rating += getRatingK(r1.N) * (player1Score - expectedScore);
  r2.rating += getRatingK(r2.N) * (expectedScore - player1Score);
  r1.N += 1;
  r2.N += 1;

  return [r1, r2];
}

export type TwoPlayerResult = 1 | 2 | 'draw';

/** Map a winner (player 1, player 2, or draw) to player 1's score. */
export function player1ScoreFromResult(result: TwoPlayerResult): number {
  if (result === 1) {
    return 1;
  }
  if (result === 2) {
    return 0;
  }
  return 0.5;
}
