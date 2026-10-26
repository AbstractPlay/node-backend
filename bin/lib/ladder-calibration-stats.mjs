/** Pure helpers for ladder calibration report (unit-tested). */

export const DEFAULT_PACE_THRESHOLD_HOURS = [6, 8, 12, 18, 24, 36, 48, 72];

export function variantComboKey(variants) {
  if (!variants || variants.length === 0) {
    return '';
  }
  return [...new Set(variants)].sort().join('|');
}

export function seriesKey(metaGame, variants) {
  const vk = variantComboKey(variants);
  return vk ? `${metaGame}#${vk}` : metaGame;
}

export function canonicalPairKey(idA, idB) {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

/**
 * @param {number[]} sorted ascending
 * @param {number} p 0–100
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) {
    return null;
  }
  if (sorted.length === 1) {
    return sorted[0];
  }
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sorted[lo];
  }
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function summarizeDistribution(values) {
  if (values.length === 0) {
    return {
      n: 0,
      p10: null,
      p25: null,
      p50: null,
      p75: null,
      p90: null,
      p95: null,
      mean: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    mean: sum / sorted.length,
  };
}

/**
 * @param {number} playerMeanHours — per-player mean hours/move in one game
 * @param {number[]} thresholdHours
 */
export function paceQualificationRates(playerMeanHours, thresholdHours) {
  const n = playerMeanHours.length;
  const out = {};
  for (const t of thresholdHours) {
    let both = 0;
    let either = 0;
    for (const row of playerMeanHours) {
      const a = row[0] <= t;
      const b = row[1] <= t;
      if (a && b) {
        both += 1;
      }
      if (a || b) {
        either += 1;
      }
    }
    out[String(t)] = {
      bothPlayersUnder: n > 0 ? both / n : null,
      eitherPlayerUnder: n > 0 ? either / n : null,
    };
  }
  return out;
}

export function stackHasTerminalFailure(stack) {
  if (!Array.isArray(stack)) {
    return false;
  }
  for (const entry of stack) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const move = entry.move;
    if (move === 'timeout' || move === 'abandoned') {
      return true;
    }
    if (typeof move === 'string' && (move.includes('timeout') || move.includes('abandoned'))) {
      return true;
    }
  }
  return false;
}

const MS_PER_HOUR = 3_600_000;

/**
 * Per-seat mean hours between consecutive stack timestamps (2P sequential model).
 * @returns {number[] | null} two means, or null if insufficient data
 */
export function perPlayerMeanHoursPerMove(stack, numPlayers) {
  if (!Array.isArray(stack) || stack.length < 2 || numPlayers !== 2) {
    return null;
  }
  const gapMs = [[], []];
  for (let i = 0; i < stack.length - 1; i += 1) {
    const t1 = entryTimeMs(stack[i]);
    const t2 = entryTimeMs(stack[i + 1]);
    if (t1 === null || t2 === null) {
      continue;
    }
    const dt = t2 - t1;
    if (dt < 0 || dt > 180 * 24 * MS_PER_HOUR) {
      continue;
    }
    const seat = i % numPlayers;
    gapMs[seat].push(dt);
  }
  const means = gapMs.map((gaps) => {
    if (gaps.length === 0) {
      return null;
    }
    const sum = gaps.reduce((a, b) => a + b, 0);
    return (sum / gaps.length) / MS_PER_HOUR;
  });
  if (means[0] === null || means[1] === null) {
    return null;
  }
  return means;
}

function entryTimeMs(entry) {
  const ts = entry?._timestamp;
  if (ts === undefined || ts === null) {
    return null;
  }
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Symmetric reach: |a−b| ≤ fraction × midpoint (ladder point tier proxy). */
export function pairingWithinReach(ratingA, ratingB, fraction) {
  const mid = (ratingA + ratingB) / 2;
  if (mid <= 0) {
    return false;
  }
  return Math.abs(ratingA - ratingB) <= fraction * mid;
}

/**
 * @param {number[]} relativeGaps — |r1−r2| / midpoint per pairing
 * @param {number[]} reachFractions e.g. [0.1, 0.2, 0.3]
 */
export function reachAllowanceRates(relativeGaps, reachFractions) {
  const n = relativeGaps.length;
  const out = {};
  for (const f of reachFractions) {
    let allowed = 0;
    for (const gap of relativeGaps) {
      if (gap <= f) {
        allowed += 1;
      }
    }
    out[String(Math.round(f * 100))] = n > 0 ? allowed / n : null;
  }
  return out;
}

/**
 * Pick smallest threshold whose bothPlayersUnder rate falls in [targetMin, targetMax].
 * @param {Record<string, { bothPlayersUnder: number | null }>} paceQualification
 */
export function pickPaceThresholdHours(
  paceQualification,
  thresholdHours,
  targetMin = 0.15,
  targetMax = 0.4,
) {
  const sorted = [...thresholdHours].sort((a, b) => a - b);
  for (const t of sorted) {
    const rate = paceQualification[String(t)]?.bothPlayersUnder;
    if (rate !== null && rate !== undefined && rate >= targetMin && rate <= targetMax) {
      return t;
    }
  }
  let best = sorted[0];
  let bestDist = Infinity;
  const target = (targetMin + targetMax) / 2;
  for (const t of sorted) {
    const rate = paceQualification[String(t)]?.bothPlayersUnder;
    if (rate === null || rate === undefined) {
      continue;
    }
    const dist = Math.abs(rate - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

export function roundRecommendation(value, { min, max, step = 1 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  let v = Math.round(value / step) * step;
  if (min !== undefined) {
    v = Math.max(min, v);
  }
  if (max !== undefined) {
    v = Math.min(max, v);
  }
  return v;
}

/**
 * @param {object} input
 */
export function computePhase0Locks(input) {
  const {
    exportUid,
    ratingsGeneratedAt,
    site,
    launchCandidates,
    bySeries,
    paceThresholds,
    pilotSeriesKeys,
  } = input;

  const flagship = pilotSeriesKeys?.[0];
  const flagshipPace = flagship ? bySeries[flagship]?.paceQualification : undefined;
  const paceThresholdHours = flagshipPace
    ? pickPaceThresholdHours(flagshipPace, paceThresholds)
    : 12;

  const rematchP25 = site.rematchGapDaysBetweenRated2pGames?.p25;
  const rematchCooldownDays = roundRecommendation(
    rematchP25 ?? 7,
    { min: 7, max: 14 },
  );

  const decayIdle = site.idleDaysWithZeroActiveRated2pGames;
  const decayAfterDays = roundRecommendation(decayIdle?.p50 ?? 90, { min: 45, max: 90 });

  const concurrentRated2p = site.activeRated2pGameCountPerUser;
  const maxConcurrent = roundRecommendation(concurrentRated2p?.p75 ?? 8, { min: 5, max: 12 });

  const reach20 = site.glickoReachAllowance?.['20'];
  const reachPct = reach20 !== null && reach20 !== undefined && reach20 < 0.55 ? 20 : 25;

  const delta = input.deltaTuning ?? {
    B: 12,
    K: 0.0006,
    lossFraction: 0.8,
  };

  return {
    sourceExportUid: exportUid ?? null,
    ratingsSnapshotAt: ratingsGeneratedAt ?? null,
    paceThresholdHours,
    paceMultiplierMax: 1.15,
    maxConcurrentLadderGames: maxConcurrent,
    rematchCooldownDays,
    decayAfterDaysNoActiveRated2p: decayAfterDays,
    decayRatePerDay: 0.005,
    challengeReachPercent: reachPct,
    B: delta.B,
    K: delta.K,
    lossFraction: delta.lossFraction,
    pilotLadderSeries: pilotSeriesKeys ?? [],
    notes: [
      'paceThresholdHours from flagship series bothPlayersUnder in 15–40% band',
      'decayAfterDays from p50 idle (zero active rated 2P), clamped 45–90 days',
      'glickoReach uses batch ratingLow at snapshot time, not historical pairing-time ratings',
      'B/K/lossFraction from analyze-ladder-delta-monte-carlo when report merged',
    ],
  };
}

export function gameLevelHoursPerMoveSlot(gameStarted, gameEnded, moveSlots) {
  if (
    gameStarted === undefined
    || gameEnded === undefined
    || moveSlots <= 0
  ) {
    return null;
  }
  const duration = gameEnded - gameStarted;
  if (duration <= 0) {
    return null;
  }
  return (duration / moveSlots) / MS_PER_HOUR;
}
