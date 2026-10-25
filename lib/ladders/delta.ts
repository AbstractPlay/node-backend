/**
 * Continuous Delta Ladder point adjustments (PDF spec).
 *
 * Roles at settlement: winner = challenger, loser = defender for the formula
 * Δ_win = B × (1 + K × (R_defender − R_challenger)) × M_pace
 * with R_defender = loser's points before the game, R_challenger = winner's.
 * Equivalently skillGap = loserPoints − winnerPoints (positive on upset wins).
 *
 * Loser loses lossFraction × Δ_win (asymmetric scoring).
 */

export type LadderDeltaTuning = {
  B: number;
  K: number;
  lossFraction: number;
};

/** Phase 0 calibration (ION export 01792886420032-6a70eaf7, Oct 2025). */
export const DEFAULT_LADDER_DELTA_TUNING: LadderDeltaTuning = {
  B: 12,
  K: 0.0006,
  lossFraction: 0.8,
};

const MIN_WIN_MULTIPLIER = 0.2;

export function ladderWinMultiplier(
  winnerPointsBefore: number,
  loserPointsBefore: number,
  K: number,
): number {
  const skillGap = loserPointsBefore - winnerPointsBefore;
  const raw = 1 + K * skillGap;
  return Math.max(MIN_WIN_MULTIPLIER, raw);
}

export function ladderWinDelta(
  winnerPointsBefore: number,
  loserPointsBefore: number,
  paceMultiplier: number,
  tuning: Pick<LadderDeltaTuning, 'B' | 'K'>,
): number {
  const mult = ladderWinMultiplier(winnerPointsBefore, loserPointsBefore, tuning.K);
  const mPace = paceMultiplier > 0 ? paceMultiplier : 1;
  return tuning.B * mult * mPace;
}

export function ladderLossDelta(winDelta: number, lossFraction: number): number {
  if (winDelta <= 0) {
    return 0;
  }
  return winDelta * lossFraction;
}

export type LadderPointDeltas = {
  winnerGain: number;
  loserLoss: number;
};

/** Single-winner game; draws return zero deltas. */
export function computeLadderPointDeltas(
  winnerPointsBefore: number,
  loserPointsBefore: number,
  paceMultiplier: number,
  tuning: LadderDeltaTuning,
): LadderPointDeltas {
  const winnerGain = ladderWinDelta(
    winnerPointsBefore,
    loserPointsBefore,
    paceMultiplier,
    tuning,
  );
  const loserLoss = ladderLossDelta(winnerGain, tuning.lossFraction);
  return { winnerGain, loserLoss };
}
