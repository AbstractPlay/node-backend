#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill historical correspondence COMPLETEDGAMES* index rows.
 *
 * Phase plan (ION only): emit candidates missing global index in the dump snapshot.
 * Phase apply: load GAME rows from the same ION dump, live Get skip if indexed since export,
 * then refreshCompletedGameIndexes (no METAGAMES bump — run admin update_meta_game_counts after).
 *
 * Usage:
 *   npx tsx scripts/backfill-correspondence-completed-index.mjs --phase plan --dump-dir .local/completed-index-ion-dump/<uid>/data
 *   npx tsx scripts/backfill-correspondence-completed-index.mjs --phase apply --stage prod --apply --limit 10 --dump-dir ... --candidates bin/correspondence-index-candidates.jsonl
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { isArenaGame } from '../lib/gamePlayMode.ts';
import { hydrateGameState } from '../lib/gameState.ts';
import {
  completedGameIndexSk,
  parseGameSk,
  refreshCompletedGameIndexes,
  resolveNumMoves,
  shouldKeepCompletedGame,
} from '../lib/gameProjector.ts';
import {
  downloadLatestIonDump,
  iterateIonDumpItems,
  resolveIonGzipPaths,
} from './lib/ion-dump-reader.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CACHE = join(repoRoot, '.local', 'completed-index-ion-dump');
const DEFAULT_CANDIDATES = join(repoRoot, 'bin', 'correspondence-index-candidates.jsonl');
const DEFAULT_META = join(repoRoot, 'bin', 'correspondence-index-candidates.meta.json');
const DEFAULT_COVERAGE = join(repoRoot, 'bin', 'completed-index-coverage.json');
const DEFAULT_PROGRESS = join(repoRoot, 'bin', 'correspondence-index-apply-progress.jsonl');

const STAGES = {
  dev: {
    profile: 'AbstractPlayDev',
    table: 'abstract-play-dev',
  },
  prod: {
    profile: 'AbstractPlayProd',
    table: 'abstract-play-prod',
  },
};

function usage() {
  console.error(`Usage: npx tsx scripts/backfill-correspondence-completed-index.mjs --phase plan|apply [options]

Plan (ION dump — no DynamoDB reads):
  --dump-dir <path>       Export data/ directory (required unless --download)
  --download              Fetch latest abstractplay-db-dump
  --cache-dir <path>      Download target (default: ${DEFAULT_CACHE})
  --candidates <path>     Output jsonl (default: ${DEFAULT_CANDIDATES})
  --metaGame <uid>        Only include one meta game
  --limit <n>             Cap candidates written (dev sampling)
  --coverage <path>       Compare count to prior analyze report (default: ${DEFAULT_COVERAGE})

Apply (writes to DynamoDB when --apply):
  --stage dev|prod        Table + AWS profile (default: dev)
  --apply                 Perform Put (default: dry-run log only)
  --dump-dir <path>       ION data/ for GAME payloads (or read dumpDir from candidates .meta.json)
  --candidates <path>     Input jsonl from plan phase
  --limit <n>             Process first N candidates only
  --concurrency <n>       Parallel index writes (default: 5)
  --progress <path>       Append applied/skipped lines (default: ${DEFAULT_PROGRESS})

  --help, -h              Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    phase: undefined,
    dumpDir: undefined,
    download: false,
    cacheDir: DEFAULT_CACHE,
    candidates: DEFAULT_CANDIDATES,
    metaOut: DEFAULT_META,
    coverage: DEFAULT_COVERAGE,
    metaGameFilter: undefined,
    limit: undefined,
    stage: 'dev',
    apply: false,
    progress: DEFAULT_PROGRESS,
    concurrency: 5,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
    } else if (arg === '--phase' && argv[i + 1]) {
      args.phase = argv[++i];
    } else if (arg === '--dump-dir' && argv[i + 1]) {
      args.dumpDir = argv[++i];
    } else if (arg === '--download') {
      args.download = true;
    } else if (arg === '--cache-dir' && argv[i + 1]) {
      args.cacheDir = argv[++i];
    } else if (arg === '--candidates' && argv[i + 1]) {
      args.candidates = argv[++i];
    } else if (arg === '--coverage' && argv[i + 1]) {
      args.coverage = argv[++i];
    } else if (arg === '--metaGame' && argv[i + 1]) {
      args.metaGameFilter = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[++i]);
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--progress' && argv[i + 1]) {
      args.progress = argv[++i];
    } else if (arg === '--concurrency' && argv[i + 1]) {
      args.concurrency = Number(argv[++i]);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!args.phase || !['plan', 'apply'].includes(args.phase)) {
    console.error('--phase plan|apply is required');
    usage();
  }

  if (args.phase === 'plan' && !args.dumpDir && !args.download) {
    console.error('--phase plan requires --dump-dir or --download');
    usage();
  }

  if (args.phase === 'apply' && !STAGES[args.stage]) {
    console.error(`Unknown stage: ${args.stage}`);
    usage();
  }

  return args;
}

async function loadCandidatesFromFile(path, limit) {
  const raw = await readFile(path, 'utf8');
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  const slice = limit !== undefined ? lines.slice(0, limit) : lines;
  return slice.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL line ${index + 1} in ${path}: ${err instanceof Error ? err.message : err}`);
    }
  });
}

async function resolveDumpDir(args) {
  if (args.dumpDir) {
    return args.dumpDir;
  }
  try {
    const metaRaw = await readFile(args.metaOut, 'utf8');
    const meta = JSON.parse(metaRaw);
    if (meta.dumpDir) {
      return meta.dumpDir;
    }
  } catch {
    // fall through
  }
  console.error('--phase apply requires --dump-dir or a plan meta file with dumpDir');
  usage();
  return undefined;
}

async function loadGameRowsFromDump(dumpDir, candidateIds) {
  const gzipPaths = await resolveIonGzipPaths(dumpDir);
  const need = new Set(candidateIds);
  const byId = new Map();

  await iterateIonDumpItems(gzipPaths, (item) => {
    if (item.pk !== 'GAME' || need.size === 0) {
      return;
    }
    const id = String(item.id ?? parseGameSk(String(item.sk ?? ''))?.gameId ?? '');
    if (!id || !need.has(id)) {
      return;
    }
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, item);
      if (byId.size === need.size) {
        need.clear();
      }
      return;
    }
    const parsed = parseGameSk(String(item.sk ?? ''));
    const existCbit = parseGameSk(String(existing.sk))?.cbit;
    if (parsed?.cbit === '1' && existCbit === '0') {
      byId.set(id, item);
    }
  });

  return byId;
}

async function globalIndexExists(docClient, tableName, lastMoveTime, gameId) {
  const sk = completedGameIndexSk(Number(lastMoveTime), gameId);
  const result = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'COMPLETEDGAMES', sk },
    ProjectionExpression: 'pk',
  }));
  return Boolean(result.Item);
}

async function loadAppliedIdsFromProgress(progressPath) {
  try {
    const raw = await readFile(progressPath, 'utf8');
    const ids = new Set();
    for (const line of raw.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      try {
        const row = JSON.parse(line);
        if (row.status === 'applied' && row.id) {
          ids.add(String(row.id));
        }
      } catch {
        // ignore bad lines
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

async function processCandidate(row, ctx) {
  const {
    gamesById,
    docClient,
    table,
    args,
    stats,
  } = ctx;

  const raw = gamesById.get(row.id);
  if (!raw) {
    stats.skippedMissingGame += 1;
    await appendFile(args.progress, `${JSON.stringify({ ts: Date.now(), status: 'missing_dump_game', ...row })}\n`);
    return;
  }

  const game = hydrateGameState(raw);
  if (!game?.id || isArenaGame(game)) {
    stats.skippedInvalid += 1;
    return;
  }

  if (await globalIndexExists(docClient, table, game.lastMoveTime, game.id)) {
    stats.skippedLiveIndex += 1;
    await appendFile(args.progress, `${JSON.stringify({ ts: Date.now(), status: 'skipped_live_index', id: game.id, metaGame: game.metaGame })}\n`);
    return;
  }

  const numMoves = resolveNumMoves(game);
  if (!shouldKeepCompletedGame(game, numMoves)) {
    stats.skippedInvalid += 1;
    return;
  }

  const sk = completedGameIndexSk(game.lastMoveTime, game.id);

  if (args.apply) {
    await refreshCompletedGameIndexes(docClient, table, game);
    stats.applied += 1;
    await appendFile(args.progress, `${JSON.stringify({ ts: Date.now(), status: 'applied', id: game.id, metaGame: game.metaGame, sk })}\n`);
    if (stats.applied % 100 === 0) {
      console.log(`  … applied ${stats.applied} (skipped live ${stats.skippedLiveIndex})`);
    }
  } else {
    stats.dryRunPlanned += 1;
  }
}

async function applyCandidates(args) {
  const dumpDir = await resolveDumpDir(args);
  const { profile, table } = STAGES[args.stage];
  let candidates = await loadCandidatesFromFile(args.candidates, args.limit);

  const alreadyApplied = await loadAppliedIdsFromProgress(args.progress);
  if (alreadyApplied.size > 0) {
    const before = candidates.length;
    candidates = candidates.filter(row => !alreadyApplied.has(row.id));
    console.log(`Resume: skipping ${before - candidates.length} ids already in progress file`);
  }

  if (candidates.length === 0) {
    console.log('No candidates to process.');
    return;
  }

  const concurrency = args.concurrency > 0 ? args.concurrency : 5;

  console.log(
    `${args.apply ? 'APPLY' : 'DRY-RUN'}: correspondence COMPLETEDGAMES backfill on ${table} (${candidates.length} candidates, concurrency ${concurrency})`,
  );
  console.log(`Dump dir: ${dumpDir}`);

  const ids = candidates.map(row => row.id);
  console.log('Loading GAME rows from ION dump…');
  const gamesById = await loadGameRowsFromDump(dumpDir, ids);
  console.log(`  loaded ${gamesById.size}/${candidates.length} GAME rows`);

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  const stats = {
    applied: 0,
    skippedLiveIndex: 0,
    skippedMissingGame: 0,
    skippedInvalid: 0,
    dryRunPlanned: 0,
  };

  const ctx = { gamesById, docClient, table, args, stats };
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= candidates.length) {
        return;
      }
      await processCandidate(candidates[i], ctx);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  console.log('');
  console.log(`Candidates processed: ${candidates.length}`);
  console.log(`Applied: ${stats.applied}`);
  console.log(`Dry-run would index: ${stats.dryRunPlanned}`);
  console.log(`Skipped (live index exists): ${stats.skippedLiveIndex}`);
  console.log(`Skipped (missing in dump): ${stats.skippedMissingGame}`);
  console.log(`Skipped (invalid/keep-rule): ${stats.skippedInvalid}`);
  if (args.apply && stats.applied > 0) {
    console.log('');
    console.log('Next: npm run update-meta-game-counts -- --stage prod --discover-admin');
  }
}

function exportUidFromDumpDir(dumpDir) {
  const normalized = dumpDir.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const dataIdx = parts.lastIndexOf('data');
  if (dataIdx > 0) {
    return parts[dataIdx - 1];
  }
  return basename(dumpDir);
}

function isBackfillCandidate(raw, globalIndexSkSet, opts) {
  const parsed = parseGameSk(String(raw.sk ?? ''));
  if (parsed?.cbit !== '1' || raw.gameEnded === undefined) {
    return undefined;
  }
  if (isArenaGame(raw)) {
    return undefined;
  }

  const metaGame = raw.metaGame ?? parsed.metaGame;
  if (opts.metaGameFilter && metaGame !== opts.metaGameFilter) {
    return undefined;
  }

  const id = String(raw.id ?? parsed.gameId ?? '');
  const lastMoveTime = Number(raw.lastMoveTime);
  if (!id || !Number.isFinite(lastMoveTime)) {
    return undefined;
  }

  const expectedSk = completedGameIndexSk(lastMoveTime, id);
  if (globalIndexSkSet.has(expectedSk)) {
    return undefined;
  }

  let numMoves;
  if (raw.numMoves !== undefined) {
    numMoves = Number(raw.numMoves);
  } else if (opts.resolveMovesFromState && raw.state) {
    numMoves = resolveNumMoves({
      pk: 'GAME',
      sk: String(raw.sk),
      id,
      metaGame,
      numPlayers: Number(raw.numPlayers ?? raw.players?.length ?? 2),
      players: raw.players ?? [],
      clockHard: Boolean(raw.clockHard),
      toMove: raw.toMove ?? '',
      lastMoveTime,
      state: String(raw.state),
    });
  } else {
    return undefined;
  }

  const numPlayers = Number(raw.numPlayers ?? raw.players?.length ?? 0);
  if (!shouldKeepCompletedGame(
    {
      pk: 'GAME',
      sk: String(raw.sk),
      id,
      metaGame,
      numPlayers,
      players: raw.players ?? [],
      clockHard: Boolean(raw.clockHard),
      toMove: raw.toMove ?? '',
      lastMoveTime,
      state: raw.state ? String(raw.state) : '{}',
    },
    numMoves,
  )) {
    return undefined;
  }

  return {
    metaGame,
    id,
    sk: String(raw.sk),
    lastMoveTime,
    numMoves,
    numPlayers,
    expectedSk,
  };
}

async function planFromIonDump(args) {
  let dumpDir = args.dumpDir;
  let exportUid;

  if (args.download) {
    const downloaded = await downloadLatestIonDump(args.cacheDir);
    dumpDir = downloaded.dataDir;
    exportUid = downloaded.exportUid;
    console.log(`Downloaded export ${exportUid} → ${dumpDir}`);
  } else {
    exportUid = exportUidFromDumpDir(dumpDir);
  }

  const gzipPaths = await resolveIonGzipPaths(dumpDir);
  const globalIndexSkSet = new Set();
  const gamesById = new Map();
  const opts = {
    metaGameFilter: args.metaGameFilter,
    resolveMovesFromState: false,
  };

  await iterateIonDumpItems(gzipPaths, (item) => {
    if (item.pk === 'COMPLETEDGAMES' && item.sk) {
      globalIndexSkSet.add(String(item.sk));
      return;
    }
    if (item.pk !== 'GAME' || item.gameEnded === undefined) {
      return;
    }
    const parsed = parseGameSk(String(item.sk ?? ''));
    if (parsed?.cbit !== '1') {
      return;
    }
    const id = String(item.id ?? parsed.gameId ?? '');
    if (!id) {
      return;
    }
    const existing = gamesById.get(id);
    if (!existing) {
      gamesById.set(id, item);
      return;
    }
    const existCbit = parseGameSk(String(existing.sk))?.cbit;
    if (parsed.cbit === '1' && existCbit === '0') {
      gamesById.set(id, item);
    }
  });

  const candidates = [];
  const byMeta = new Map();
  let skippedMissingNumMoves = 0;

  for (const raw of gamesById.values()) {
    const row = isBackfillCandidate(raw, globalIndexSkSet, opts);
    if (!row) {
      if (
        !isArenaGame(raw)
        && parseGameSk(String(raw.sk ?? ''))?.cbit === '1'
        && raw.gameEnded !== undefined
        && raw.numMoves === undefined
      ) {
        skippedMissingNumMoves += 1;
      }
      continue;
    }
    candidates.push(row);
    byMeta.set(row.metaGame, (byMeta.get(row.metaGame) ?? 0) + 1);
    if (args.limit !== undefined && candidates.length >= args.limit) {
      break;
    }
  }

  candidates.sort((a, b) => a.metaGame.localeCompare(b.metaGame) || a.id.localeCompare(b.id));

  const jsonl = candidates.map(row => JSON.stringify(row)).join('\n');
  const payload = jsonl.length > 0 ? `${jsonl}\n` : '';

  await writeFile(args.candidates, payload);

  const meta = {
    generatedAt: new Date().toISOString(),
    phase: 'plan',
    dumpDir,
    exportUid,
    globalIndexRowsInDump: globalIndexSkSet.size,
    completedGamesInDump: gamesById.size,
    candidateCount: candidates.length,
    metaGameFilter: args.metaGameFilter,
    limit: args.limit,
    skippedMissingNumMoves,
    byMetaGame: Object.fromEntries([...byMeta.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  await writeFile(args.metaOut, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`Dump: ${dumpDir}`);
  console.log(`Export uid: ${exportUid}`);
  console.log(`Global COMPLETEDGAMES rows in dump: ${globalIndexSkSet.size}`);
  console.log(`Completed GAME rows (deduped): ${gamesById.size}`);
  console.log(`Candidates written: ${candidates.length}`);
  if (skippedMissingNumMoves > 0) {
    console.log(`Skipped (missing numMoves on GAME row): ${skippedMissingNumMoves}`);
  }
  console.log(`Wrote ${args.candidates}`);
  console.log(`Wrote ${args.metaOut}`);

  let expectedFromCoverage;
  try {
    const coverageRaw = await readFile(args.coverage, 'utf8');
    const coverage = JSON.parse(coverageRaw);
    expectedFromCoverage = coverage.stats?.noIndexWouldKeepCorrespondence;
    if (typeof expectedFromCoverage === 'number') {
      const delta = candidates.length - expectedFromCoverage;
      console.log('');
      console.log(`Coverage report: noIndexWouldKeepCorrespondence = ${expectedFromCoverage}`);
      if (delta === 0) {
        console.log('Match: candidate count equals coverage report.');
      } else {
        console.log(`Delta vs coverage report: ${delta > 0 ? '+' : ''}${delta}`);
        if (args.metaGameFilter || args.limit !== undefined) {
          console.log('(Filter/limit may explain delta.)');
        }
      }
    }
  } catch {
    console.log('');
    console.log(`No coverage comparison (${args.coverage} missing or unreadable).`);
  }

  console.log('');
  console.log('Review — top meta games by candidate count:');
  const topMeta = [...byMeta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [meta, count] of topMeta) {
    console.log(`  ${meta}: ${count}`);
  }

  if (candidates.length > 0) {
    console.log('');
    console.log('Review — first 3 candidates:');
    for (const row of candidates.slice(0, 3)) {
      console.log(`  ${JSON.stringify(row)}`);
    }
  }

  return { candidates, meta, expectedFromCoverage };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.phase === 'apply') {
    await applyCandidates(args);
    return;
  }

  await planFromIonDump(args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
