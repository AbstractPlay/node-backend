import type { LadderTuning } from './types.js';

/**
 * v1 pace bonus: game-level mean hours per move slot; both players must be under threshold.
 */
export function computePaceMultiplier(
  gameStarted: number,
  gameEnded: number,
  numMoves: number,
  tuning: Pick<LadderTuning, 'paceThresholdHours' | 'paceMultiplierMax'>,
): number {
  if (numMoves <= 0 || gameEnded <= gameStarted) {
    return 1;
  }
  const hoursPerMove = (gameEnded - gameStarted) / numMoves / (1000 * 60 * 60);
  if (hoursPerMove >= tuning.paceThresholdHours) {
    return 1;
  }
  return tuning.paceMultiplierMax;
}
