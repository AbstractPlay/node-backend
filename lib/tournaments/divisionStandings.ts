/** Inputs for division score / tiebreak / placement (matches endTournament queries). */
export type DivisionStandingGame = {
  player1: string;
  player2: string;
  winner?: string[];
};

export type DivisionStandingPlayer = {
  playerid: string;
  playername: string;
  rating?: number;
};

export type DivisionStandingRow = {
  playerid: string;
  playername: string;
  score: number;
  tiebreak: number;
  rating: number;
  /** Original `players` array index — tie-breaker after score, tiebreak, rating. */
  order: number;
};

export type DivisionStandingsResult = {
  ranked: DivisionStandingRow[];
  winnerId: string;
  winnerName: string;
};

/** Sort key for final placement (higher is better). */
export function compareDivisionStandingRows(a: DivisionStandingRow, b: DivisionStandingRow): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.tiebreak !== b.tiebreak) {
    return b.tiebreak - a.tiebreak;
  }
  if (a.rating !== b.rating) {
    return b.rating - a.rating;
  }
  return a.order - b.order;
}

/**
 * Round-robin division standings and winner.
 * Logic must stay aligned with division completion in `authHandlers.endTournament`.
 */
export function computeDivisionStandings(
  games: DivisionStandingGame[],
  players: DivisionStandingPlayer[],
): DivisionStandingsResult {
  const scores = new Map<string, { score: number; tiebreak: number }>();
  const meta = new Map<string, { playername: string; rating: number; order: number }>();

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    scores.set(player.playerid, { score: 0, tiebreak: 0 });
    meta.set(player.playerid, {
      playername: player.playername,
      rating: player.rating ?? 0,
      order: i,
    });
  }

  for (const game of games) {
    if (game.winner?.length === 2) {
      scores.get(game.player1)!.score += 0.5;
      scores.get(game.player2)!.score += 0.5;
    } else if (game.winner !== undefined && game.winner.length >= 1) {
      scores.get(game.winner[0])!.score += 1;
    }
  }

  for (const game of games) {
    if (game.winner?.length === 2) {
      scores.get(game.player1)!.tiebreak += scores.get(game.player2)!.score / 2;
      scores.get(game.player2)!.tiebreak += scores.get(game.player1)!.score / 2;
    } else if (game.winner !== undefined && game.winner.length >= 1) {
      if (game.winner[0] === game.player1) {
        scores.get(game.player1)!.tiebreak += scores.get(game.player2)!.score;
      } else {
        scores.get(game.player2)!.tiebreak += scores.get(game.player1)!.score;
      }
    }
  }

  const ranked: DivisionStandingRow[] = players.map((player, order) => {
    const totals = scores.get(player.playerid)!;
    const info = meta.get(player.playerid)!;
    return {
      playerid: player.playerid,
      playername: info.playername,
      score: totals.score,
      tiebreak: totals.tiebreak,
      rating: info.rating,
      order,
    };
  });
  ranked.sort(compareDivisionStandingRows);

  let bestScore = 0;
  let bestTiebreak = 0;
  let bestRating = 0;
  let winnerId = '';
  let winnerName = '';
  for (const player of players) {
    const score = scores.get(player.playerid)!.score;
    const tiebreak = scores.get(player.playerid)!.tiebreak;
    const rating = player.rating!;
    if (score > bestScore) {
      bestScore = score;
      bestTiebreak = tiebreak;
      bestRating = rating;
      winnerId = player.playerid;
      winnerName = player.playername;
    } else if (score === bestScore) {
      if (tiebreak > bestTiebreak) {
        bestTiebreak = tiebreak;
        bestRating = rating;
        winnerId = player.playerid;
        winnerName = player.playername;
      } else if (tiebreak === bestTiebreak) {
        if (rating > bestRating) {
          bestRating = rating;
          winnerId = player.playerid;
          winnerName = player.playername;
        }
      }
    }
  }

  return {
    ranked,
    winnerId,
    winnerName,
  };
}

/** Apply computed tiebreak values onto player-shaped records (for Dynamo updates). */
export function applyDivisionTiebreaks<T extends { playerid: string; tiebreak?: number }>(
  players: T[],
  result: DivisionStandingsResult,
): void {
  const byId = new Map(result.ranked.map((row) => [row.playerid, row.tiebreak]));
  for (const player of players) {
    const tiebreak = byId.get(player.playerid);
    if (tiebreak !== undefined) {
      player.tiebreak = tiebreak;
    }
  }
}
