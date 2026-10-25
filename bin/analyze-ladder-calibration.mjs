#!/usr/bin/env node
/**
 * Ladder tuning calibration from a local DynamoDB ION export (or --download from S3).
 *
 * Usage:
 *   npm run analyze-ladder-calibration -- --dump-dir ".local/ladder-ion-dump/<uid>"
 *   npm run analyze-ladder-calibration -- --download
 *
 * Requires network for default Glicko snapshot (--ratings-url); use --skip-ratings offline.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameFactory, gameinfo, variantUidsForBatchRating } from '@abstractplay/gameslib';
import { batchRatingGameLabel } from '../lib/batchRatings.js';
import { decompressGameState } from '../lib/gameState.js';
import {
  downloadLatestIonDump,
  iterateIonDumpItems,
  resolveIonGzipPaths,
} from './lib/ion-dump-reader.mjs';
import {
  DEFAULT_RATINGS_URL,
  buildGlickoRatingLowIndex,
  fetchSummaryRatings,
  lookupRatingLow,
} from './lib/ladder-calibration-ratings.mjs';
import {
  canonicalPairKey,
  computePhase0Locks,
  DEFAULT_PACE_THRESHOLD_HOURS,
  gameLevelHoursPerMoveSlot,
  paceQualificationRates,
  perPlayerMeanHoursPerMove,
  reachAllowanceRates,
  seriesKey,
  stackHasTerminalFailure,
  summarizeDistribution,
} from './lib/ladder-calibration-stats.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CACHE = join(repoRoot, '.local', 'ladder-ion-dump');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REACH_FRACTIONS = [0.1, 0.2, 0.3];

function usage() {
  console.log(`Usage: npm run analyze-ladder-calibration -- [options]

Options:
  --dump-dir <path>       Local export root, data/, or single .ion.gz (required unless --download)
  --download              Fetch latest abstractplay-db-dump export into --cache-dir
  --cache-dir <path>      Download target (default: ${DEFAULT_CACHE})
  --out <path>            Write JSON report (default: bin/ladder-calibration-report.json)
  --ratings-url <url>     _summary-ratings.json (${DEFAULT_RATINGS_URL})
  --skip-ratings          Skip Glicko reach analysis
  --meta-game <uid>       Only analyze one meta game UID
  --since-days <n>        Completed-game window (default: 365)
  --max-games <n>         Stop after N rated-2P pace extractions (dev sampling)
  --pace-thresholds <h>   Comma-separated hours (default: ${DEFAULT_PACE_THRESHOLD_HOURS.join(',')})
  --help                  This message
`);
}

function parseArgs(argv) {
  const args = {
    dumpDir: undefined,
    download: false,
    cacheDir: DEFAULT_CACHE,
    out: join(repoRoot, 'bin', 'ladder-calibration-report.json'),
    ratingsUrl: DEFAULT_RATINGS_URL,
    skipRatings: false,
    metaGame: undefined,
    sinceDays: 365,
    maxGames: undefined,
    paceThresholds: [...DEFAULT_PACE_THRESHOLD_HOURS],
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
    } else if (arg === '--meta-game' && argv[i + 1]) {
      args.metaGame = argv[++i];
    } else if (arg === '--since-days' && argv[i + 1]) {
      args.sinceDays = Number(argv[++i]);
    } else if (arg === '--max-games' && argv[i + 1]) {
      args.maxGames = Number(argv[++i]);
    } else if (arg === '--pace-thresholds' && argv[i + 1]) {
      args.paceThresholds = argv[i + 1].split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
      i += 1;
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

function inferExportUidFromPath(dataDir) {
  const normalized = dataDir.replace(/\\/g, '/');
  const match = normalized.match(/\/(\d{8,}-[a-f0-9]+)(?:\/|$)/);
  return match ? match[1] : null;
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

function isRated2pCohort(rec) {
  if (rec.pk !== 'GAME') {
    return false;
  }
  if (!Array.isArray(rec.players) || rec.players.length !== 2) {
    return false;
  }
  if (rec.rated !== true) {
    return false;
  }
  if (rec.teachingMode === true) {
    return false;
  }
  const meta = resolveMetaGame(rec);
  if (!meta || !metaLadderEligible(meta)) {
    return false;
  }
  if (argsMetaFilter && meta !== argsMetaFilter) {
    return false;
  }
  return true;
}

function ratingLabelForGame(meta, variants) {
  const defs = gameinfo.get(meta)?.variants;
  const canonical =
    defs !== undefined && defs.length > 0
      ? variantUidsForBatchRating(meta, 2, variants)
      : variants;
  return batchRatingGameLabel(meta, canonical);
}

let argsMetaFilter;

function createMetaBucket() {
  return {
    rated2pCompleted: 0,
    rated2pCasual: 0,
    rated2pEvent: 0,
    pacePlayerMeans: [],
    gameLevelHours: [],
    timeoutOrAbandoned: 0,
    factoryErrors: 0,
    clockBuckets: new Map(),
  };
}

function clockBucketKey(rec) {
  const hard = rec.clockHard === true;
  const inc = rec.clockInc ?? '?';
  const max = rec.clockMax ?? '?';
  return `${hard ? 'hard' : 'soft'}:${inc}/${max}`;
}

async function main() {
  const args = parseArgs(process.argv);
  argsMetaFilter = args.metaGame;

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

  let ratingsGeneratedAt = null;
  let glickoIndex = null;
  if (!args.skipRatings) {
    console.log(`Fetching ratings from ${args.ratingsUrl}`);
    const ratings = await fetchSummaryRatings(args.ratingsUrl);
    ratingsGeneratedAt = ratings.generatedAt;
    glickoIndex = buildGlickoRatingLowIndex(ratings.glickoByGame);
    console.log(`Glicko index: ${glickoIndex.size} user×pool rows`);
  }

  const gzipPaths = await resolveIonGzipPaths(dataDir);
  console.log(`Parsing ${gzipPaths.length} ION file(s) from ${dataDir}`);

  const cutoffMs = Date.now() - args.sinceDays * MS_PER_DAY;

  const currentGamesPerUser = new Map();
  const currentGameLinks = [];
  const rated2pGameIds = new Set();
  const metaStats = new Map();
  const pairCompletions = new Map();
  const userLastEnded = new Map();
  const ratingPairings = [];
  let totalItems = 0;
  let paceGamesProcessed = 0;
  let paceGamesSkippedWindow = 0;

  const ensureMeta = (key) => {
    if (!metaStats.has(key)) {
      metaStats.set(key, createMetaBucket());
    }
    return metaStats.get(key);
  };

  await iterateIonDumpItems(gzipPaths, async (item) => {
    totalItems += 1;
    if (totalItems % 500_000 === 0) {
      console.log(`  … ${totalItems} items scanned`);
    }

    const pk = item.pk;
    if (typeof pk === 'string' && pk.startsWith('CURRENTGAMES#')) {
      const userId = pk.slice('CURRENTGAMES#'.length);
      const gameId = typeof item.sk === 'string' ? item.sk : '';
      currentGamesPerUser.set(userId, (currentGamesPerUser.get(userId) ?? 0) + 1);
      if (gameId) {
        currentGameLinks.push({ userId, gameId });
      }
      return;
    }

    if (pk !== 'GAME') {
      return;
    }

    if (!isRated2pCohort(item)) {
      return;
    }

    const meta = resolveMetaGame(item);
    if (!meta) {
      return;
    }
    if (typeof item.id === 'string') {
      rated2pGameIds.add(item.id);
    }

    const variants = Array.isArray(item.variants) ? item.variants : [];
    const sk = item.sk;
    const key = seriesKey(meta, variants);
    const bucket = ensureMeta(key);

    if (!isCompletedGameSk(sk)) {
      return;
    }

    bucket.rated2pCompleted += 1;
    const isEvent = item.tournament !== undefined || item.event !== undefined;
    if (isEvent) {
      bucket.rated2pEvent += 1;
    } else {
      bucket.rated2pCasual += 1;
    }

    const gameEnded = typeof item.gameEnded === 'number' ? item.gameEnded : undefined;
    if (gameEnded !== undefined && gameEnded >= cutoffMs) {
      for (const p of item.players) {
        const prev = userLastEnded.get(p.id);
        if (prev === undefined || gameEnded > prev) {
          userLastEnded.set(p.id, gameEnded);
        }
      }
      const pairKey = canonicalPairKey(item.players[0].id, item.players[1].id);
      const list = pairCompletions.get(pairKey) ?? [];
      list.push(gameEnded);
      pairCompletions.set(pairKey, list);

      if (glickoIndex) {
        ratingPairings.push({
          meta,
          variants,
          p0: item.players[0].id,
          p1: item.players[1].id,
        });
      }
    }

    if (gameEnded === undefined || gameEnded < cutoffMs) {
      paceGamesSkippedWindow += 1;
      return;
    }

    if (args.maxGames !== undefined && paceGamesProcessed >= args.maxGames) {
      return;
    }

    if (!item.state || typeof item.state !== 'string') {
      return;
    }

    let engine;
    try {
      const stateJson = decompressGameState(item.state);
      engine = GameFactory(meta, stateJson);
    } catch {
      bucket.factoryErrors += 1;
      return;
    }
    if (engine === undefined) {
      bucket.factoryErrors += 1;
      return;
    }

    if (stackHasTerminalFailure(engine.stack)) {
      bucket.timeoutOrAbandoned += 1;
      return;
    }

    const playerMeans = perPlayerMeanHoursPerMove(engine.stack, 2);
    if (playerMeans) {
      bucket.pacePlayerMeans.push(playerMeans);
      paceGamesProcessed += 1;
    }

    const moveSlots = Math.max(0, (engine.stack?.length ?? 0) - 1);
    const gameStarted = typeof item.gameStarted === 'number' ? item.gameStarted : undefined;
    const coarse = gameLevelHoursPerMoveSlot(gameStarted, gameEnded, moveSlots);
    if (coarse !== null) {
      bucket.gameLevelHours.push(coarse);
    }

    const ck = clockBucketKey(item);
    bucket.clockBuckets.set(ck, (bucket.clockBuckets.get(ck) ?? 0) + 1);
  });

  const rated2pActivePerUser = new Map();
  for (const { userId, gameId } of currentGameLinks) {
    if (!rated2pGameIds.has(gameId)) {
      continue;
    }
    rated2pActivePerUser.set(userId, (rated2pActivePerUser.get(userId) ?? 0) + 1);
  }

  const concurrencyCounts = [...currentGamesPerUser.values()];
  const concurrencySummary = summarizeDistribution(concurrencyCounts);
  const rated2pConcurrencyCounts = [...rated2pActivePerUser.values()];
  const rated2pConcurrencySummary = summarizeDistribution(rated2pConcurrencyCounts);

  const now = Date.now();
  const idleDays = [];
  const idleDaysZeroActiveAll = [];
  const idleDaysZeroActiveRated2p = [];

  for (const [userId, ended] of userLastEnded) {
    const idle = (now - ended) / MS_PER_DAY;
    idleDays.push(idle);
    const allActive = currentGamesPerUser.get(userId) ?? 0;
    if (allActive === 0) {
      idleDaysZeroActiveAll.push(idle);
    }
    const rated2pActive = rated2pActivePerUser.get(userId) ?? 0;
    if (rated2pActive === 0) {
      idleDaysZeroActiveRated2p.push(idle);
    }
  }

  const rematchGapsDays = [];
  for (const times of pairCompletions.values()) {
    if (times.length < 2) {
      continue;
    }
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) {
      rematchGapsDays.push((times[i] - times[i - 1]) / MS_PER_DAY);
    }
  }
  const rematchSummary = summarizeDistribution(rematchGapsDays);

  const relativeGaps = [];
  const absGaps = [];
  let ratingPairingsWithBoth = 0;
  if (glickoIndex) {
    for (const row of ratingPairings) {
      const label = ratingLabelForGame(row.meta, row.variants);
      const r0 = lookupRatingLow(glickoIndex, row.p0, label);
      const r1 = lookupRatingLow(glickoIndex, row.p1, label);
      if (r0 === null || r1 === null) {
        continue;
      }
      ratingPairingsWithBoth += 1;
      const mid = (r0 + r1) / 2;
      if (mid > 0) {
        relativeGaps.push(Math.abs(r0 - r1) / mid);
      }
      absGaps.push(Math.abs(r0 - r1));
    }
  }

  const bySeries = {};
  for (const [key, bucket] of metaStats.entries()) {
    const playerFlat = bucket.pacePlayerMeans.flat();
    const perGameMax = bucket.pacePlayerMeans.map(([a, b]) => Math.max(a, b));
    const perGameMin = bucket.pacePlayerMeans.map(([a, b]) => Math.min(a, b));

    const clockBreakdown = {};
    for (const [ck, n] of bucket.clockBuckets.entries()) {
      clockBreakdown[ck] = n;
    }

    bySeries[key] = {
      rated2pCompleted: bucket.rated2pCompleted,
      rated2pCasual: bucket.rated2pCasual,
      rated2pEvent: bucket.rated2pEvent,
      paceGamesAnalyzed: bucket.pacePlayerMeans.length,
      factoryErrors: bucket.factoryErrors,
      endedByTimeoutOrAbandoned: bucket.timeoutOrAbandoned,
      perPlayerMeanHoursPerMove: summarizeDistribution(playerFlat),
      perGameMaxPlayerMeanHours: summarizeDistribution(perGameMax),
      perGameMinPlayerMeanHours: summarizeDistribution(perGameMin),
      gameLevelHoursPerMoveSlot: summarizeDistribution(bucket.gameLevelHours),
      paceQualification: paceQualificationRates(bucket.pacePlayerMeans, args.paceThresholds),
      clockSettingsCounts: clockBreakdown,
    };
  }

  const launchCandidates = Object.entries(bySeries)
    .map(([key, row]) => ({
      seriesKey: key,
      rated2pCompleted: row.rated2pCompleted,
      paceGamesAnalyzed: row.paceGamesAnalyzed,
      medianPerPlayerHours: row.perPlayerMeanHoursPerMove.p50,
    }))
    .filter((r) => r.paceGamesAnalyzed >= 20)
    .sort((a, b) => b.rated2pCompleted - a.rated2pCompleted)
    .slice(0, 30);

  const pilotSeriesKeys = launchCandidates.slice(0, 3).map((c) => c.seriesKey);

  const site = {
    activeGameCountPerUser: {
      ...concurrencySummary,
      note: 'CURRENTGAMES# rows per user (all game types).',
    },
    activeRated2pGameCountPerUser: {
      ...rated2pConcurrencySummary,
      usersWithActiveRated2p: rated2pActivePerUser.size,
      note: 'CURRENTGAMES# games that are rated 2P ladder-eligible in this dump.',
    },
    idleDaysSinceLastRated2pCompletion: {
      ...summarizeDistribution(idleDays),
      note: 'Users with ≥1 rated 2P completion in window; now − last gameEnded.',
    },
    idleDaysWithZeroActiveGames: {
      ...summarizeDistribution(idleDaysZeroActiveAll),
      note: 'Subset with zero CURRENTGAMES# rows (all types).',
    },
    idleDaysWithZeroActiveRated2pGames: {
      ...summarizeDistribution(idleDaysZeroActiveRated2p),
      note: 'Subset with zero active rated 2P games — decay-idle proxy for ladder.',
    },
    rematchGapDaysBetweenRated2pGames: {
      ...rematchSummary,
      note: 'Consecutive completions per canonical pair in window.',
    },
    glickoPairingSnapshot: {
      pairingsInWindow: ratingPairings.length,
      pairingsWithBothRatings: ratingPairingsWithBoth,
      relativeRatingGap: summarizeDistribution(relativeGaps),
      absoluteRatingLowGap: summarizeDistribution(absGaps),
      ratingsGeneratedAt,
    },
    glickoReachAllowance: reachAllowanceRates(relativeGaps, REACH_FRACTIONS),
  };

  let deltaTuning;
  const monteCarloPath = join(repoRoot, 'bin', 'ladder-delta-monte-carlo.json');
  try {
    const raw = await readFile(monteCarloPath, 'utf8');
    const monte = JSON.parse(raw);
    if (monte?.locked?.B !== undefined) {
      deltaTuning = {
        B: monte.locked.B,
        K: monte.locked.K,
        lossFraction: monte.locked.lossFraction,
      };
      console.log(`Merged Δ tuning from ${monteCarloPath}`);
    }
  } catch {
    // optional companion report from analyze-ladder-delta-monte-carlo
  }

  const recommendations = {
    locked: computePhase0Locks({
      exportUid,
      ratingsGeneratedAt,
      site,
      launchCandidates,
      bySeries,
      paceThresholds: args.paceThresholds,
      pilotSeriesKeys,
      deltaTuning,
    }),
    paceThresholdHint: 'Choose T where paceQualification.bothPlayersUnder is ~0.15–0.40 for target metas.',
    maxConcurrentHint: 'Use activeRated2pGameCountPerUser p75 for ladder cap (not all-game p90).',
    decayAfterDaysHint: 'Use idleDaysWithZeroActiveRated2pGames p75 for decay start.',
    rematchCooldownDaysHint: 'Use rematch p25 (rapid re-pair tail).',
    reachHint: 'glickoReachAllowance = share of window pairings within ±N% ratingLow midpoint at snapshot.',
  };

  const report = {
    generatedAt: new Date().toISOString(),
    exportUid,
    dumpDir: dataDir,
    parameters: {
      sinceDays: args.sinceDays,
      paceThresholdHours: args.paceThresholds,
      metaGameFilter: args.metaGame ?? null,
      maxGames: args.maxGames ?? null,
      ratingsUrl: args.skipRatings ? null : args.ratingsUrl,
    },
    scan: {
      totalIonItems: totalItems,
      paceGamesProcessed,
      paceGamesSkippedOutsideWindow: paceGamesSkippedWindow,
      usersWithCurrentGamesIndex: currentGamesPerUser.size,
      rated2pGameIdsIndexed: rated2pGameIds.size,
    },
    site,
    recommendations,
    launchCandidates,
    bySeries,
  };

  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${args.out}`);
  console.log(`Launch candidates (top 5): ${launchCandidates.slice(0, 5).map((c) => c.seriesKey).join(', ') || '(none)'}`);
  console.log('Phase 0 locks:', JSON.stringify(recommendations.locked, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
