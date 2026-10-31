#!/usr/bin/env node
/* eslint-env node */
/**
 * Classify completed GAME rows vs global COMPLETEDGAMES index coverage.
 *
 * Cost notes (see also crons/docs/s3-outputs.md):
 * - **records.abstractplay.com / ALL.json** — no COMPLETEDGAMES rows; archive subset only.
 *   Not useful for this index audit.
 * - **abstractplay-db-dump ION export** (`--source ion-dump`) — one local pass over pk=GAME
 *   and pk=COMPLETEDGAMES; cheapest for full-table stats after a single download.
 * - **Live DynamoDB** (`--source dynamodb`) — Query global COMPLETEDGAMES (small) + Scan
 *   completed GAME with narrow projection; avoid N× GetItem. Use `--max-games` for a cheap sample.
 *
 * Usage:
 *   npx tsx scripts/analyze-completed-game-index-coverage.mjs --stage prod
 *   npx tsx scripts/analyze-completed-game-index-coverage.mjs --stage prod --max-games 500
 *   npx tsx scripts/analyze-completed-game-index-coverage.mjs --source ion-dump --download
 *   npx tsx scripts/analyze-completed-game-index-coverage.mjs --source ion-dump --dump-dir .local/ion-dump/<uid>/data
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { isArenaGame } from '../lib/gamePlayMode.ts';
import {
  completedGameIndexSk,
  parseGameSk,
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
  console.error(`Usage: npx tsx scripts/analyze-completed-game-index-coverage.mjs [options]

Options:
  --source dynamodb|ion-dump   Data source (default: dynamodb)
  --stage dev|prod             For dynamodb (default: dev)
  --metaGame <uid>             Limit to one meta game
  --max-games <n>              Stop after N completed games (cheap sanity sample)
  --resolve-moves-from-state   Decompress state when numMoves missing (slow)
  --examples <n>               Print N example ids per anomaly bucket (default: 3)
  --out <path>                 Write JSON report (default: bin/completed-index-coverage.json)
  --dump-dir <path>            ION export data/ (with --source ion-dump)
  --download                   Fetch latest abstractplay-db-dump into --cache-dir
  --cache-dir <path>           Download target (default: ${DEFAULT_CACHE})
  --help, -h                   Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    source: 'dynamodb',
    stage: 'dev',
    metaGameFilter: undefined,
    maxGames: undefined,
    resolveMovesFromState: false,
    examples: 3,
    out: join(repoRoot, 'bin', 'completed-index-coverage.json'),
    dumpDir: undefined,
    download: false,
    cacheDir: DEFAULT_CACHE,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
    } else if (arg === '--source' && argv[i + 1]) {
      args.source = argv[++i];
    } else if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--metaGame' && argv[i + 1]) {
      args.metaGameFilter = argv[++i];
    } else if (arg === '--max-games' && argv[i + 1]) {
      args.maxGames = Number(argv[++i]);
    } else if (arg === '--resolve-moves-from-state') {
      args.resolveMovesFromState = true;
    } else if (arg === '--examples' && argv[i + 1]) {
      args.examples = Number(argv[++i]);
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (arg === '--dump-dir' && argv[i + 1]) {
      args.dumpDir = argv[++i];
    } else if (arg === '--download') {
      args.download = true;
    } else if (arg === '--cache-dir' && argv[i + 1]) {
      args.cacheDir = argv[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!['dynamodb', 'ion-dump'].includes(args.source)) {
    console.error(`Unknown --source: ${args.source}`);
    usage();
  }
  if (args.source === 'dynamodb' && !STAGES[args.stage]) {
    console.error(`Unknown stage: ${args.stage}`);
    usage();
  }
  if (args.source === 'ion-dump' && !args.dumpDir && !args.download) {
    console.error('--source ion-dump requires --dump-dir or --download');
    usage();
  }

  return args;
}

function emptyStats() {
  return {
    completedGames: 0,
    hasGlobalIndex: 0,
    noGlobalIndex: 0,
    wouldKeep: 0,
    wouldNotKeep: 0,
    noIndexWouldNotKeep: 0,
    noIndexWouldKeep: 0,
    noIndexWouldKeepArena: 0,
    noIndexWouldKeepCorrespondence: 0,
    hasIndexWouldNotKeep: 0,
    indexSkMismatch: 0,
    missingTopLevelNumMoves: 0,
    resolvedNumMovesFromState: 0,
    arenaCompleted: 0,
    correspondenceCompleted: 0,
  };
}

function pushExample(bucket, key, value, limit) {
  if (!bucket[key]) {
    bucket[key] = [];
  }
  if (bucket[key].length < limit) {
    bucket[key].push(value);
  }
}

function classifyGame(raw, globalIndexSkSet, globalIndexByGameId, opts) {
  const parsed = parseGameSk(String(raw.sk ?? ''));
  if (parsed?.cbit !== '1' || raw.gameEnded === undefined) {
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
  const hasGlobalIndex = globalIndexSkSet.has(expectedSk);
  const altSk = globalIndexByGameId.get(id);
  const indexSkMismatch = Boolean(!hasGlobalIndex && altSk && altSk !== expectedSk);

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
    numMoves = undefined;
  }

  const numPlayers = Number(raw.numPlayers ?? raw.players?.length ?? 0);
  const wouldKeep = numMoves === undefined
    ? undefined
    : shouldKeepCompletedGame(
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
    );

  const arena = isArenaGame(raw);

  return {
    id,
    metaGame,
    lastMoveTime,
    expectedSk,
    altSk,
    numMoves,
    numPlayers,
    wouldKeep,
    hasGlobalIndex,
    indexSkMismatch,
    hasIndexAtOtherSk: Boolean(!hasGlobalIndex && altSk),
    arena,
  };
}

function applyClassification(stats, examples, row, exampleLimit) {
  stats.completedGames += 1;
  if (row.arena) {
    stats.arenaCompleted += 1;
  } else {
    stats.correspondenceCompleted += 1;
  }

  if (row.numMoves === undefined) {
    stats.missingTopLevelNumMoves += 1;
  }

  if (row.hasGlobalIndex) {
    stats.hasGlobalIndex += 1;
  } else {
    stats.noGlobalIndex += 1;
  }

  if (row.indexSkMismatch) {
    stats.indexSkMismatch += 1;
    pushExample(examples, 'indexSkMismatch', {
      id: row.id,
      metaGame: row.metaGame,
      expectedSk: row.expectedSk,
      actualSk: row.altSk,
    }, exampleLimit);
  }

  if (row.wouldKeep === undefined) {
    return;
  }

  if (row.wouldKeep) {
    stats.wouldKeep += 1;
  } else {
    stats.wouldNotKeep += 1;
  }

  if (!row.hasGlobalIndex && row.wouldKeep === false) {
    stats.noIndexWouldNotKeep += 1;
  } else if (!row.hasGlobalIndex && row.wouldKeep === true) {
    stats.noIndexWouldKeep += 1;
    const ex = {
      id: row.id,
      metaGame: row.metaGame,
      numMoves: row.numMoves,
      numPlayers: row.numPlayers,
      arena: row.arena,
      expectedSk: row.expectedSk,
    };
    if (row.arena) {
      stats.noIndexWouldKeepArena += 1;
      pushExample(examples, 'noIndexWouldKeepArena', ex, exampleLimit);
    } else {
      stats.noIndexWouldKeepCorrespondence += 1;
      pushExample(examples, 'noIndexWouldKeepCorrespondence', ex, exampleLimit);
    }
  } else if (row.hasGlobalIndex && row.wouldKeep === false) {
    stats.hasIndexWouldNotKeep += 1;
    pushExample(examples, 'hasIndexWouldNotKeep', {
      id: row.id,
      metaGame: row.metaGame,
      numMoves: row.numMoves,
      numPlayers: row.numPlayers,
      sk: row.expectedSk,
    }, exampleLimit);
  }
}

async function loadGlobalIndexFromDdb(docClient, tableName) {
  const globalIndexSkSet = new Set();
  const globalIndexByGameId = new Map();
  let lastKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'COMPLETEDGAMES' },
      ProjectionExpression: '#sk',
      ExclusiveStartKey: lastKey,
    }));

    for (const item of page.Items ?? []) {
      const sk = String(item.sk ?? '');
      globalIndexSkSet.add(sk);
      const hash = sk.indexOf('#');
      if (hash > 0) {
        const gameId = sk.slice(hash + 1);
        if (gameId) {
          globalIndexByGameId.set(gameId, sk);
        }
      }
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return { globalIndexSkSet, globalIndexByGameId };
}

async function scanCompletedGamesDdb(docClient, tableName, metaGameFilter, maxGames) {
  const items = [];
  let lastEvaluatedKey;

  const filterParts = ['#pk = :pk', 'attribute_exists(#ended)'];
  const names = {
    '#pk': 'pk',
    '#ended': 'gameEnded',
    '#id': 'id',
    '#sk': 'sk',
  };
  const values = { ':pk': 'GAME' };

  if (metaGameFilter) {
    filterParts.push('#mg = :mg');
    names['#mg'] = 'metaGame';
    values[':mg'] = metaGameFilter;
  }

  const projection = [
    '#id',
    '#sk',
    'metaGame',
    'numPlayers',
    'numMoves',
    'lastMoveTime',
    'playMode',
    'gameEnded',
    'players',
    'clockHard',
    'toMove',
  ];

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ProjectionExpression: projection.join(', '),
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      const parsed = parseGameSk(String(item.sk ?? ''));
      if (parsed?.cbit === '1') {
        items.push(item);
        if (maxGames !== undefined && items.length >= maxGames) {
          return items;
        }
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

function dedupeCompletedById(rawItems) {
  const byId = new Map();
  for (const raw of rawItems) {
    if (!raw?.id || !raw?.sk) {
      continue;
    }
    const parsed = parseGameSk(String(raw.sk));
    if (parsed?.cbit !== '1') {
      continue;
    }
    const existing = byId.get(raw.id);
    if (!existing) {
      byId.set(raw.id, raw);
      continue;
    }
    const existCbit = parseGameSk(String(existing.sk))?.cbit;
    if (parsed.cbit === '1' && existCbit === '0') {
      byId.set(raw.id, raw);
    }
  }
  return [...byId.values()];
}

async function analyzeFromDdb(args) {
  const { profile, table } = STAGES[args.stage];
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  console.log(`Loading global COMPLETEDGAMES keys from ${table}…`);
  const { globalIndexSkSet, globalIndexByGameId } = await loadGlobalIndexFromDdb(docClient, table);
  console.log(`  global index rows: ${globalIndexSkSet.size}`);

  console.log(`Scanning completed GAME rows (projection only)…`);
  const scanned = await scanCompletedGamesDdb(
    docClient,
    table,
    args.metaGameFilter,
    args.maxGames,
  );
  const games = dedupeCompletedById(scanned);
  console.log(`  completed GAME rows (deduped): ${games.length}`);

  return { games, globalIndexSkSet, globalIndexByGameId, table };
}

async function analyzeFromIonDump(args) {
  let dumpDir = args.dumpDir;
  if (args.download) {
    const { dataDir } = await downloadLatestIonDump(args.cacheDir);
    dumpDir = dataDir;
    console.log(`Downloaded export data: ${dataDir}`);
  }

  const gzipPaths = await resolveIonGzipPaths(dumpDir);
  const globalIndexSkSet = new Set();
  const globalIndexByGameId = new Map();
  const gamesById = new Map();
  let processed = 0;

  await iterateIonDumpItems(gzipPaths, (item) => {
    if (item.pk === 'COMPLETEDGAMES' && item.sk) {
      const sk = String(item.sk);
      globalIndexSkSet.add(sk);
      const hash = sk.indexOf('#');
      if (hash > 0) {
        const gameId = sk.slice(hash + 1);
        if (gameId) {
          globalIndexByGameId.set(gameId, sk);
        }
      }
      return;
    }

    if (item.pk !== 'GAME' || item.gameEnded === undefined) {
      return;
    }
    const parsed = parseGameSk(String(item.sk ?? ''));
    if (parsed?.cbit !== '1') {
      return;
    }
    const metaGame = item.metaGame ?? parsed.metaGame;
    if (args.metaGameFilter && metaGame !== args.metaGameFilter) {
      return;
    }
    const id = String(item.id ?? parsed.gameId ?? '');
    if (!id) {
      return;
    }
    const existing = gamesById.get(id);
    if (!existing) {
      gamesById.set(id, item);
      processed += 1;
    } else {
      const existCbit = parseGameSk(String(existing.sk))?.cbit;
      if (parsed.cbit === '1' && existCbit === '0') {
        gamesById.set(id, item);
      }
    }
    if (args.maxGames !== undefined && processed >= args.maxGames) {
      // Note: iterateIonDumpItems does not support early abort; --max-games is best-effort on dump.
    }
  });

  const games = args.maxGames !== undefined
    ? [...gamesById.values()].slice(0, args.maxGames)
    : [...gamesById.values()];

  console.log(`  global index rows in dump: ${globalIndexSkSet.size}`);
  console.log(`  completed GAME rows (deduped): ${games.length}`);

  return {
    games,
    globalIndexSkSet,
    globalIndexByGameId,
    table: `ion-dump:${dumpDir}`,
  };
}

function printSummary(report) {
  const { stats, meta } = report;
  console.log('');
  console.log(`Source: ${meta.source} (${meta.table})`);
  if (meta.metaGameFilter) {
    console.log(`Meta game filter: ${meta.metaGameFilter}`);
  }
  console.log('');
  console.log('Counts');
  console.log(`  Completed GAME rows:        ${stats.completedGames}`);
  console.log(`  Global COMPLETEDGAMES rows: ${meta.globalIndexRowCount}`);
  console.log(`  Has global index (expected sk): ${stats.hasGlobalIndex}`);
  console.log(`  No global index:            ${stats.noGlobalIndex}`);
  console.log('');
  console.log('Move-count keep rule (shouldKeepCompletedGame)');
  console.log(`  Would keep (index expected):  ${stats.wouldKeep}`);
  console.log(`  Would not keep (no index OK): ${stats.wouldNotKeep}`);
  console.log(`  No index + would not keep:    ${stats.noIndexWouldNotKeep}  ← expected bulk`);
  console.log(`  No index + would keep:        ${stats.noIndexWouldKeep}  ← investigate`);
  console.log(`    arena:                      ${stats.noIndexWouldKeepArena}`);
  console.log(`    correspondence:             ${stats.noIndexWouldKeepCorrespondence}`);
  console.log(`  Has index + would not keep:   ${stats.hasIndexWouldNotKeep}  ← unusual`);
  console.log(`  Index sk mismatch (other ts): ${stats.indexSkMismatch}`);
  console.log('');
  console.log('Other');
  console.log(`  Arena completed:            ${stats.arenaCompleted}`);
  console.log(`  Correspondence completed:     ${stats.correspondenceCompleted}`);
  console.log(`  Missing top-level numMoves:   ${stats.missingTopLevelNumMoves}`);
  if (meta.resolveMovesFromState) {
    console.log(`  (used --resolve-moves-from-state for missing numMoves)`);
  } else if (stats.missingTopLevelNumMoves > 0) {
    console.log('  Re-run with --resolve-moves-from-state if keep-rule counts look low.');
  }

  const { examples } = report;
  for (const [bucket, rows] of Object.entries(examples)) {
    if (rows.length === 0) {
      continue;
    }
    console.log('');
    console.log(`Examples: ${bucket}`);
    for (const row of rows) {
      console.log(`  ${JSON.stringify(row)}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const opts = {
    metaGameFilter: args.metaGameFilter,
    resolveMovesFromState: args.resolveMovesFromState,
  };

  let games;
  let globalIndexSkSet;
  let globalIndexByGameId;
  let table;

  if (args.source === 'ion-dump') {
    ({ games, globalIndexSkSet, globalIndexByGameId, table } = await analyzeFromIonDump(args));
  } else {
    ({ games, globalIndexSkSet, globalIndexByGameId, table } = await analyzeFromDdb(args));
  }

  const stats = emptyStats();
  const examples = {};

  for (const raw of games) {
    const row = classifyGame(raw, globalIndexSkSet, globalIndexByGameId, opts);
    if (!row) {
      continue;
    }
    applyClassification(stats, examples, row, args.examples);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    meta: {
      source: args.source,
      stage: args.source === 'dynamodb' ? args.stage : undefined,
      table,
      metaGameFilter: args.metaGameFilter,
      maxGames: args.maxGames,
      resolveMovesFromState: args.resolveMovesFromState,
      globalIndexRowCount: globalIndexSkSet.size,
    },
    stats,
    examples,
  };

  printSummary(report);
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log('');
  console.log(`Wrote ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
