#!/usr/bin/env node
/**
 * Tune B, K, lossFraction by replaying rated 2P completions with ladder reach + Δ formula.
 *
 *   npm run analyze-ladder-delta-monte-carlo -- --dump-dir ".local/ladder-ion-dump/<uid>"
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameinfo, variantUidsForBatchRating } from '@abstractplay/gameslib';
import { batchRatingGameLabel, GLICKO_PRIOR_RATING_LOW } from '../lib/batchRatings.js';
import { computeLadderPointDeltas } from '../lib/ladders/delta.ts';
import {
  downloadLatestIonDump,
  iterateIonDumpItems,
  resolveIonGzipPaths,
} from './lib/ion-dump-reader.mjs';
import {
  buildGlickoRatingLowIndex,
  DEFAULT_RATINGS_URL,
  fetchSummaryRatings,
  lookupRatingLow,
} from './lib/ladder-calibration-ratings.mjs';
import { gridSearchDeltaTuning, replayLadderGames, scoreReplayForTuning } from './lib/ladder-monte-carlo.mjs';
import { seriesKey } from './lib/ladder-calibration-stats.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CACHE = join(repoRoot, '.local', 'ladder-ion-dump');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_SERIES = ['amazons', 'tintas', 'valley'];

function inferExportUidFromPath(dataDir) {
  const normalized = dataDir.replace(/\\/g, '/');
  const match = normalized.match(/\/(\d{8,}-[a-f0-9]+)(?:\/|$)/);
  return match ? match[1] : null;
}

function usage() {
  console.log(`Usage: npm run analyze-ladder-delta-monte-carlo -- [options]

Options:
  --dump-dir <path>       Local ION export (required unless --download)
  --download              Fetch latest dump
  --cache-dir <path>      Download target (default: ${DEFAULT_CACHE})
  --out <path>            JSON output (default: bin/ladder-delta-monte-carlo.json)
  --ratings-url <url>     (${DEFAULT_RATINGS_URL})
  --skip-ratings          Use defaultStartPoints only
  --since-days <n>        Game window (default: 365)
  --series <keys>         Comma-separated seriesKey prefixes (default: ${DEFAULT_SERIES.join(',')})
  --reach-percent <n>     Challenge reach when --ladder-reach-only (default: 20)
  --ladder-reach-only     Replay only pairings in reach at current ladder points
  --help
`);
}

function parseArgs(argv) {
  const args = {
    dumpDir: undefined,
    download: false,
    cacheDir: DEFAULT_CACHE,
    out: join(repoRoot, 'bin', 'ladder-delta-monte-carlo.json'),
    ratingsUrl: DEFAULT_RATINGS_URL,
    skipRatings: false,
    sinceDays: 365,
    seriesPrefixes: [...DEFAULT_SERIES],
    reachPercent: 20,
    ladderReachOnly: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg === '--download') {
      args.download = true;
    } else if (arg === '--skip-ratings') {
      args.skipRatings = true;
    } else if (arg === '--dump-dir' && argv[i + 1]) {
      args.dumpDir = argv[++i];
    } else if (arg === '--cache-dir' && argv[i + 1]) {
      args.cacheDir = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg === '--ratings-url' && argv[i + 1]) {
      args.ratingsUrl = argv[++i];
    } else if (arg === '--since-days' && argv[i + 1]) {
      args.sinceDays = Number(argv[++i]);
    } else if (arg === '--series' && argv[i + 1]) {
      args.seriesPrefixes = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
      i += 0;
    } else if (arg === '--reach-percent' && argv[i + 1]) {
      args.reachPercent = Number(argv[++i]);
    } else if (arg === '--ladder-reach-only') {
      args.ladderReachOnly = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
      process.exit(1);
    }
  }
  if (!args.download && !args.dumpDir) {
    console.error('Provide --dump-dir or --download');
    usage();
    process.exit(1);
  }
  return args;
}

function resolveMetaGame(rec) {
  if (typeof rec.metaGame === 'string' && rec.metaGame.length > 0) {
    return rec.metaGame;
  }
  if (typeof rec.sk === 'string') {
    const meta = rec.sk.split('#')[0];
    if (meta.length > 0) {
      return meta;
    }
  }
  return undefined;
}

function isCompletedGameSk(sk) {
  return typeof sk === 'string' && sk.includes('#1#');
}

function metaLadderEligible(metaGame) {
  const info = gameinfo.get(metaGame);
  if (!info?.playercounts?.includes(2)) {
    return false;
  }
  if (info.flags?.includes('simultaneous')) {
    return false;
  }
  return true;
}

function seriesAllowed(key, prefixes) {
  for (const p of prefixes) {
    if (key === p || key.startsWith(`${p}#`)) {
      return true;
    }
  }
  return false;
}

function ratingLabelForGame(meta, variants) {
  const defs = gameinfo.get(meta)?.variants;
  const canonical =
    defs !== undefined && defs.length > 0
      ? variantUidsForBatchRating(meta, 2, variants)
      : variants;
  return batchRatingGameLabel(meta, canonical);
}

function computeDeltas(wPts, lPts, mPace, tuning) {
  return computeLadderPointDeltas(wPts, lPts, mPace, tuning);
}

async function main() {
  const args = parseArgs(process.argv);

  let dataDir = args.dumpDir;
  let exportUid = null;
  if (args.download) {
    const result = await downloadLatestIonDump(args.cacheDir);
    exportUid = result.exportUid;
    dataDir = result.dataDir;
    console.log(`Using export ${exportUid} at ${dataDir}`);
  } else if (dataDir) {
    exportUid = inferExportUidFromPath(dataDir);
  }

  let glickoIndex = null;
  let ratingsGeneratedAt = null;
  if (!args.skipRatings) {
    console.log(`Fetching ratings from ${args.ratingsUrl}`);
    const ratings = await fetchSummaryRatings(args.ratingsUrl);
    ratingsGeneratedAt = ratings.generatedAt;
    glickoIndex = buildGlickoRatingLowIndex(ratings.glickoByGame);
  }

  const gzipPaths = await resolveIonGzipPaths(dataDir);
  const cutoffMs = Date.now() - args.sinceDays * MS_PER_DAY;
  const reachFraction = args.reachPercent / 100;

  const games = [];
  const initialPoints = new Map();
  let totalScanned = 0;

  await iterateIonDumpItems(gzipPaths, async (item) => {
    totalScanned += 1;
    if (item.pk !== 'GAME') {
      return;
    }
    if (!Array.isArray(item.players) || item.players.length !== 2) {
      return;
    }
    if (item.rated !== true || item.teachingMode === true) {
      return;
    }
    const meta = resolveMetaGame(item);
    if (!meta || !metaLadderEligible(meta)) {
      return;
    }
    if (!isCompletedGameSk(item.sk)) {
      return;
    }
    const gameEnded = typeof item.gameEnded === 'number' ? item.gameEnded : undefined;
    if (gameEnded === undefined || gameEnded < cutoffMs) {
      return;
    }

    const variants = Array.isArray(item.variants) ? item.variants : [];
    const sk = seriesKey(meta, variants);
    if (!seriesAllowed(sk, args.seriesPrefixes)) {
      return;
    }

    const winner = item.winner;
    if (!Array.isArray(winner) || winner.length !== 1) {
      return;
    }
    const winSeat = winner[0];
    if (winSeat !== 1 && winSeat !== 2) {
      return;
    }
    const loseSeat = winSeat === 1 ? 2 : 1;
    const winnerId = item.players[winSeat - 1]?.id;
    const loserId = item.players[loseSeat - 1]?.id;
    if (typeof winnerId !== 'string' || typeof loserId !== 'string') {
      return;
    }

    if (glickoIndex) {
      const label = ratingLabelForGame(meta, variants);
      for (const pid of [winnerId, loserId]) {
        if (!initialPoints.has(pid)) {
          const r = lookupRatingLow(glickoIndex, pid, label);
          if (r !== null) {
            initialPoints.set(pid, r);
          }
        }
      }
    }

    games.push({
      winnerId,
      loserId,
      endedAt: gameEnded,
      seriesKey: sk,
      paceMultiplier: 1,
    });
  });

  games.sort((a, b) => a.endedAt - b.endedAt);
  console.log(`Scanned ${totalScanned} items; ${games.length} decisive rated 2P games in pilot series`);
  console.log(`Initial ladder points seeded for ${initialPoints.size} users from Glicko ratingLow`);

  const replayOpts = {
    initialPoints,
    defaultStartPoints: GLICKO_PRIOR_RATING_LOW,
    reachFraction,
    enforceReach: args.ladderReachOnly,
  };

  const search = gridSearchDeltaTuning(games, computeDeltas, { replayOpts });
  const bestTuning = {
    B: search.best.B,
    K: search.best.K,
    lossFraction: search.best.lossFraction,
  };

  const validationReplay = replayLadderGames(games, bestTuning, computeDeltas, replayOpts);
  const validationMetrics = scoreReplayForTuning(validationReplay);

  const locked = {
    B: bestTuning.B,
    K: bestTuning.K,
    lossFraction: bestTuning.lossFraction,
    monteCarloScore: search.best.score,
    gamesReplayed: validationReplay.gamesApplied,
    gamesSkippedReach: validationReplay.gamesSkippedReach,
    medianWinDeltaEvenMatch: validationMetrics.medEven,
    medianWinDeltaUpset: validationMetrics.medUpset,
    medianWinDeltaFarm: validationMetrics.medFarm,
    netInflationPerGame: validationMetrics.inflationPerGame,
    sourceExportUid: exportUid,
    ratingsSnapshotAt: ratingsGeneratedAt,
    seriesPrefixes: args.seriesPrefixes,
    challengeReachPercent: args.reachPercent,
    notes: [
      args.ladderReachOnly
        ? 'Replay with ±reach enforced at current ladder points'
        : 'Replay all pilot decisive games (reach enforced at matchmaking, not in replay)',
      'M_pace=1 for tuning (pace bonus applied separately via paceMultiplierMax)',
      'Grid minimizes even-match |Δ−12|, inflation ~2.2/game, upset/farm spread',
    ],
  };

  const report = {
    generatedAt: new Date().toISOString(),
    parameters: {
      sinceDays: args.sinceDays,
      reachPercent: args.reachPercent,
      seriesPrefixes: args.seriesPrefixes,
    },
    scan: { totalIonItems: totalScanned, gamesCollected: games.length },
    locked,
    gridSearch: {
      combinationsTried: search.combinationsTried,
      topTen: search.topTen,
    },
  };

  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${args.out}`);
  console.log('Locked Δ tuning:', JSON.stringify(locked, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
