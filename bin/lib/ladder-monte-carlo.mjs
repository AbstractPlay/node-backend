/** Monte Carlo / replay scoring for ladder Δ tuning (pure, unit-tested). */

import { pairingWithinReach } from './ladder-calibration-stats.mjs';

/**
 * @typedef {{ winnerId: string, loserId: string, endedAt: number, paceMultiplier?: number }} LadderReplayGame
 */

/**
 * @param {Map<string, number>} points
 * @param {string} userId
 * @param {number} fallback
 */
function pointsFor(points, userId, fallback) {
  const v = points.get(userId);
  return v !== undefined ? v : fallback;
}

/**
 * Replay games in order; only applies reach filter when both players have points.
 * @param {LadderReplayGame[]} games sorted by endedAt ascending
 * @param {object} tuning { B, K, lossFraction }
 * @param {object} computeDeltas (wPts, lPts, mPace, tuning) => { winnerGain, loserLoss }
 * @param {object} opts
 * @param {Map<string, number>} [opts.initialPoints]
 * @param {number} [opts.defaultStartPoints=1500]
 * @param {number} [opts.reachFraction=0.2]
 * @param {boolean} [opts.enforceReach=true]
 */
export function replayLadderGames(games, tuning, computeDeltas, opts = {}) {
  const {
    initialPoints = new Map(),
    defaultStartPoints = 1500,
    reachFraction = 0.2,
    enforceReach = true,
  } = opts;

  const points = new Map(initialPoints);
  const winDeltas = [];
  const evenWinDeltas = [];
  const upsetWinDeltas = [];
  const farmWinDeltas = [];
  let gamesApplied = 0;
  let gamesSkippedReach = 0;
  let drawsSkipped = 0;
  let netInflation = 0;

  for (const g of games) {
    if (!g.winnerId || !g.loserId) {
      drawsSkipped += 1;
      continue;
    }

    const wBefore = pointsFor(points, g.winnerId, defaultStartPoints);
    const lBefore = pointsFor(points, g.loserId, defaultStartPoints);

    if (
      enforceReach
      && !pairingWithinReach(wBefore, lBefore, reachFraction)
    ) {
      gamesSkippedReach += 1;
      continue;
    }

    const mPace = g.paceMultiplier ?? 1;
    const { winnerGain, loserLoss } = computeDeltas(wBefore, lBefore, mPace, tuning);

    points.set(g.winnerId, wBefore + winnerGain);
    points.set(g.loserId, Math.max(0, lBefore - loserLoss));

    winDeltas.push(winnerGain);
    netInflation += winnerGain - loserLoss;
    gamesApplied += 1;

    const mid = (wBefore + lBefore) / 2;
    const relGap = mid > 0 ? (lBefore - wBefore) / mid : 0;
    if (Math.abs(relGap) <= 0.05) {
      evenWinDeltas.push(winnerGain);
    } else if (lBefore > wBefore) {
      upsetWinDeltas.push(winnerGain);
    } else {
      farmWinDeltas.push(winnerGain);
    }
  }

  return {
    gamesApplied,
    gamesSkippedReach,
    drawsSkipped,
    netInflation,
    winDeltas,
    evenWinDeltas,
    upsetWinDeltas,
    farmWinDeltas,
    finalPoints: points,
  };
}

function median(sorted) {
  if (sorted.length === 0) {
    return null;
  }
  const s = [...sorted].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Score a replay for grid search (lower is better).
 * @param {ReturnType<typeof replayLadderGames>} replay
 */
export function scoreReplayForTuning(replay) {
  const medEven = median(replay.evenWinDeltas);
  const medUpset = median(replay.upsetWinDeltas);
  const medFarm = median(replay.farmWinDeltas);
  const medAll = median(replay.winDeltas);
  const inflationPerGame =
    replay.gamesApplied > 0 ? replay.netInflation / replay.gamesApplied : null;

  const targetEven = 12;
  const targetInflation = 2.2;

  let score = 0;
  if (medEven !== null) {
    score += Math.abs(medEven - targetEven) * 2;
  } else if (medAll !== null) {
    score += Math.abs(medAll - targetEven) * 2.5;
  } else {
    score += 50;
  }

  if (inflationPerGame !== null) {
    score += Math.abs(inflationPerGame - targetInflation) * 8;
  }

  if (medUpset !== null && medEven !== null && medEven > 0) {
    const ratio = medUpset / medEven;
    if (ratio < 1.15) {
      score += (1.15 - ratio) * 40;
    }
    if (ratio > 1.8) {
      score += (ratio - 1.8) * 25;
    }
  }

  if (medFarm !== null && medEven !== null && medEven > 0) {
    const farmRatio = medFarm / medEven;
    if (farmRatio > 0.95) {
      score += (farmRatio - 0.95) * 30;
    }
    if (farmRatio < 0.35) {
      score += (0.35 - farmRatio) * 20;
    }
  }

  const tinyWins = replay.winDeltas.filter((d) => d < 2).length;
  if (replay.winDeltas.length > 0) {
    const tinyRate = tinyWins / replay.winDeltas.length;
    if (tinyRate > 0.08) {
      score += (tinyRate - 0.08) * 80;
    }
  }

  return {
    score,
    medEven,
    medUpset,
    medFarm,
    medAll,
    inflationPerGame,
    meanWinDelta: mean(replay.winDeltas),
  };
}

/**
 * @param {LadderReplayGame[]} games
 * @param {object} computeDeltas
 * @param {object} [opts]
 * @param {number[]} [opts.BValues]
 * @param {number[]} [opts.KValues]
 * @param {number[]} [opts.lossFractionValues]
 */
export function gridSearchDeltaTuning(games, computeDeltas, opts = {}) {
  const BValues = opts.BValues ?? [8, 10, 12, 14, 16, 18];
  const KValues = opts.KValues ?? [0.0004, 0.0006, 0.0008, 0.001, 0.0012, 0.0015];
  const lossFractionValues = opts.lossFractionValues ?? [0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];

  let best = null;
  const top = [];

  for (const B of BValues) {
    for (const K of KValues) {
      for (const lossFraction of lossFractionValues) {
        const tuning = { B, K, lossFraction };
        const replay = replayLadderGames(games, tuning, computeDeltas, opts.replayOpts);
        const metrics = scoreReplayForTuning(replay);
        const row = {
          B,
          K,
          lossFraction,
          ...metrics,
          gamesApplied: replay.gamesApplied,
        };
        top.push(row);
        if (best === null || metrics.score < best.score) {
          best = row;
        }
      }
    }
  }

  top.sort((a, b) => a.score - b.score);

  return {
    best,
    topTen: top.slice(0, 10),
    combinationsTried: top.length,
  };
}
