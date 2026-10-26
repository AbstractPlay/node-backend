import type { LadderFinishedGame } from './applyLadderGameEnd.js';
import { applyLadderGameEnd } from './applyLadderGameEnd.js';

type GameSlice = {
  id: string;
  ladderId?: string;
  metaGame: string;
  variants?: string[];
  winner?: number[];
  players: { id: string }[];
  rated?: boolean;
  gameStarted?: number;
  gameEnded?: number;
  numMoves?: number;
};

export function ladderGameEndFromFullGame(game: GameSlice): LadderFinishedGame | undefined {
  if (game.ladderId === undefined) {
    return undefined;
  }
  return {
    id: game.id,
    ladderId: game.ladderId,
    metaGame: game.metaGame,
    variants: game.variants,
    winner: game.winner,
    players: game.players,
    rated: game.rated,
    gameStarted: game.gameStarted,
    gameEnded: game.gameEnded,
    numMoves: game.numMoves,
  };
}

export async function runLadderGameEndHook(game: GameSlice): Promise<void> {
  const payload = ladderGameEndFromFullGame(game);
  if (payload === undefined) {
    return;
  }
  await applyLadderGameEnd(payload);
}
