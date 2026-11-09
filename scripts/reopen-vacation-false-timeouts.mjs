#!/usr/bin/env node
/* eslint-env node */
/**
 * Reopen correspondence games that were false clock timeouts (e.g. vacation stop).
 *
 * Usage:
 *   npm run reopen-vacation-false-timeouts -- --stage prod --game-id <id> --meta-game estate --dry-run
 *   npm run reopen-vacation-false-timeouts -- --stage prod --from-csv vacation-stop-clock-incidents.csv --tier rated_casual --dry-run
 *   npm run reopen-vacation-false-timeouts -- --stage prod --game-id <id> --meta-game estate --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  applyReopenFalseTimeout,
  assessReopenFalseTimeout,
  loadCompletedGame,
  reopenSalvageTier,
} from '../lib/games/reopenFalseTimeout.ts';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

function usage() {
  console.error(`Usage: npx tsx scripts/reopen-vacation-false-timeouts.mjs [options]

Options:
  --stage dev|prod              (default: dev)
  --game-id <uuid>              Single game (requires --meta-game unless --from-csv resolves it)
  --meta-game <name>            Meta game id (e.g. estate)
  --from-csv <path>             Batch from incident CSV (gameId, metaGame, timedOutSeat columns)
  --tier rated_casual|casual|any  Salvage filter (default: rated_casual)
  --timed-out-seat <n>          1-based seat check (single-game; csv supplies per row)
  --dry-run                     Assess only (default)
  --apply                       Write GAME #0# and refresh WATCHED#
  --sync-indexes                Also purge COMPLETEDGAMES + restore CURRENTGAMES (avoid if stream healthy)
  --no-sync-watchers            Skip WATCHED# summary refresh on apply
  --help, -h
`);
  process.exit(1);
}

function parseCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const col = (name) => header.indexOf(name);
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    return {
      gameId: c[col('gameId')],
      metaGame: c[col('metaGame')],
      timedOutSeat: col('timedOutSeat') >= 0 ? Number(c[col('timedOutSeat')]) : undefined,
      loserName: col('loserName') >= 0 ? c[col('loserName')] : '',
    };
  });
}

function formatAudit(audit) {
  return JSON.stringify(audit, null, 2);
}

async function reopenOne(doc, table, spec, opts) {
  const completed = await loadCompletedGame(doc, table, spec.metaGame, spec.gameId);
  if (!completed) {
    console.log(`SKIP ${spec.metaGame} ${spec.gameId}: no #1# row`);
    return { status: 'missing' };
  }

  const tier = reopenSalvageTier(completed);
  if (opts.tierPolicy !== 'any' && tier !== opts.tierPolicy) {
    console.log(`SKIP ${spec.metaGame} ${spec.gameId}: tier ${tier} (policy ${opts.tierPolicy})`);
    return { status: 'tier_skip', tier };
  }

  const assess = assessReopenFalseTimeout(completed, {
    tierPolicy: opts.tierPolicy,
    timedOutSeat: spec.timedOutSeat,
  });
  if (!assess.ok) {
    console.log(`FAIL ${spec.metaGame} ${spec.gameId}: ${assess.reason}`);
    return { status: 'fail', reason: assess.reason };
  }

  const applyOpts = {
    tierPolicy: opts.tierPolicy,
    timedOutSeat: spec.timedOutSeat,
    dryRun: !opts.apply,
    syncIndexes: opts.syncIndexes,
    syncWatchers: opts.syncWatchers,
  };
  const result = await applyReopenFalseTimeout(doc, table, assess, applyOpts);
  const label = opts.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`${label} ${spec.metaGame} ${spec.gameId} tier=${tier}`);
  console.log(formatAudit(result.audit));
  return { status: opts.apply ? 'applied' : 'dry_run', audit: result.audit };
}

async function main() {
  let stage = 'dev';
  let gameId;
  let metaGame;
  let csvArg;
  let apply = false;
  let tierPolicy = 'rated_casual';
  let timedOutSeat;
  let syncIndexes = false;
  let syncWatchers = true;

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--stage' && process.argv[i + 1]) stage = process.argv[++i];
    else if (arg === '--game-id' && process.argv[i + 1]) gameId = process.argv[++i];
    else if (arg === '--meta-game' && process.argv[i + 1]) metaGame = process.argv[++i];
    else if (arg === '--from-csv' && process.argv[i + 1]) csvArg = process.argv[++i];
    else if (arg === '--tier' && process.argv[i + 1]) tierPolicy = process.argv[++i];
    else if (arg === '--timed-out-seat' && process.argv[i + 1]) {
      timedOutSeat = Number(process.argv[++i]);
    } else if (arg === '--dry-run') apply = false;
    else if (arg === '--apply') apply = true;
    else if (arg === '--sync-indexes') syncIndexes = true;
    else if (arg === '--no-sync-watchers') syncWatchers = false;
    else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const stageCfg = STAGES[stage];
  if (!stageCfg) {
    console.error(`Unknown stage: ${stage}`);
    process.exit(1);
  }

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile: stageCfg.profile,
  }));

  const opts = { apply, tierPolicy, syncIndexes, syncWatchers };
  const specs = [];

  if (csvArg) {
    const csvPath = path.isAbsolute(csvArg) ? csvArg : path.join(root, csvArg);
    for (const row of parseCsv(csvPath)) {
      if (gameId && row.gameId !== gameId) continue;
      specs.push(row);
    }
  } else if (gameId && metaGame) {
    specs.push({ gameId, metaGame, timedOutSeat, loserName: '' });
  } else {
    console.error('Provide --game-id and --meta-game, or --from-csv');
    usage();
  }

  if (specs.length === 0) {
    console.error('No games matched filters');
    process.exit(1);
  }

  const summary = {};
  for (const spec of specs) {
    const outcome = await reopenOne(doc, stageCfg.table, spec, opts);
    const key = outcome.status === 'tier_skip' ? 'skip' : outcome.status;
    summary[key] = (summary[key] ?? 0) + 1;
  }

  console.log(`\nDone (${stage}): ${JSON.stringify(summary)}`);
  if (summary.fail > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
