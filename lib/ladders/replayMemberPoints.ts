import { computeLadderPointDeltas } from './delta.js';
import { computePaceMultiplier } from './paceMultiplier.js';
import type { LadderTuning } from './types.js';

export type LadderReplayGame = {
  gameId: string;
  settledAt: number;
  winner?: number[];
  players: { id: string }[];
  gameStarted?: number;
  gameEnded?: number;
  numMoves?: number;
};

/**
 * Replay decisive ladder settlements in time order using each member's join `startingPoints`.
 * Does not model daily inactivity decay (compare live `points` with that in mind).
 */
export function replayLadderPointsFromGames(
  playerStartingPoints: Map<string, number>,
  tuning: LadderTuning,
  games: LadderReplayGame[],
): Map<string, number> {
  const points = new Map(playerStartingPoints);
  const ordered = [...games].sort((a, b) => a.settledAt - b.settledAt);

  for (const game of ordered) {
    if (game.winner === undefined || game.winner.length !== 1) {
      continue;
    }
    const p0 = game.players[0]?.id;
    const p1 = game.players[1]?.id;
    if (p0 === undefined || p1 === undefined) {
      continue;
    }

    const winnerIndex = game.winner[0]! - 1;
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winnerId = game.players[winnerIndex]!.id;
    const loserId = game.players[loserIndex]!.id;

    const winnerBefore = points.get(winnerId);
    const loserBefore = points.get(loserId);
    if (winnerBefore === undefined || loserBefore === undefined) {
      continue;
    }

    const ended = game.gameEnded ?? game.settledAt;
    const started = game.gameStarted ?? ended;
    const pace = computePaceMultiplier(
      started,
      ended,
      game.numMoves ?? 0,
      tuning,
    );
    const { winnerGain, loserLoss } = computeLadderPointDeltas(
      winnerBefore,
      loserBefore,
      pace,
      tuning,
    );
    points.set(winnerId, winnerBefore + winnerGain);
    points.set(loserId, Math.max(0, loserBefore - loserLoss));
  }

  return points;
}
