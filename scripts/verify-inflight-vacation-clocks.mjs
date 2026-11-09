#!/usr/bin/env node
/* eslint-env node */
/**
 * Read-only: for active hard-clock games on a user's dashboard, recompute
 * effective remaining time using the same path as me_dashboard (vacationClockStints
 * + live vacation). Use after stint backfill to confirm clocks would not false-timeout.
 *
 * Usage:
 *   npm run verify-inflight-vacation-clocks -- --stage prod --userId <uuid>
 *   npm run verify-inflight-vacation-clocks -- --stage prod --from-csv vacation-stop-clock-incidents.csv
 */
import fs from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { verifyInflightClocksForUser } from '../lib/vacation/verifyInflightClocks.ts';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

function usage() {
  console.error(`Usage: npx tsx scripts/verify-inflight-vacation-clocks.mjs [options]

Options:
  --stage dev|prod     (default: dev)
  --userId <uuid>      Repeatable
  --from-csv <path>    Check losers still in dashboard (intersection with active games)
  --gameId <id>        Limit to one game (with --userId)
  --json               Machine-readable output
  --help, -h
`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    stage: 'dev',
    userIds: [],
    csvPath: null,
    gameIds: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    if (a === '--stage') { out.stage = argv[++i]; continue; }
    if (a === '--userId') { out.userIds.push(argv[++i]); continue; }
    if (a === '--from-csv') { out.csvPath = argv[++i]; continue; }
    if (a === '--gameId') {
      out.gameIds = out.gameIds ?? new Set();
      out.gameIds.add(argv[++i]);
      continue;
    }
    if (a === '--json') { out.json = true; continue; }
    console.error(`Unknown option: ${a}`);
    usage();
  }
  return out;
}

function loserIdsFromCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const loserIdx = header.indexOf('loserId');
  const gameIdx = header.indexOf('gameId');
  const byLoser = new Map();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const loserId = cols[loserIdx];
    const gameId = gameIdx >= 0 ? cols[gameIdx] : undefined;
    if (!loserId) continue;
    if (!byLoser.has(loserId)) byLoser.set(loserId, new Set());
    if (gameId) byLoser.get(loserId).add(gameId);
  }
  return byLoser;
}

function formatMs(ms) {
  if (ms < 0) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m (${ms}ms)`;
  if (h > 0) return `${h}h ${m}m (${ms}ms)`;
  return `${m}m (${ms}ms)`;
}

function printHuman(result) {
  console.log(`\n=== ${result.userName ?? result.userId} (${result.userId}) ===`);
  console.log(`vacationClockStints: ${result.vacationStintCount}, vacationPauseMsUsed: ${result.vacationPauseMsUsed ?? 'n/a'}`);
  console.log(`hard-clock active games checked: ${result.hardClockGames}`);
  if (result.rows.length === 0) {
    console.log('(no active hard-clock games on dashboard)');
    return;
  }
  for (const row of result.rows) {
    const flag = row.ok ? 'OK' : 'FAIL';
    const onClock = row.onClockPlayerId ? `${row.onClockPlayerName} <${row.onClockPlayerId}>` : '(none)';
    console.log(`  [${flag}] ${row.metaGame} ${row.gameId}`);
    console.log(`      on clock: ${onClock}`);
    console.log(`      bank ${formatMs(row.bankMs)} | wall think ${formatMs(row.wallThinkMs)} | fair think ${formatMs(row.fairThinkMs)}`);
    console.log(`      effective remaining ${formatMs(row.effectiveRemainingMs)} | wouldTimeOut=${row.wouldTimeOutNow} paused=${row.clockPaused ?? false}`);
    if (row.note) console.log(`      note: ${row.note}`);
  }
  if (result.failures.length > 0) {
    console.log(`\n*** ${result.failures.length} game(s) would timeout NOW under fair clock ***`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stage = STAGES[args.stage];
  if (!stage) {
    console.error(`Unknown stage: ${args.stage}`);
    usage();
  }

  let checks = args.userIds.map(id => ({ userId: id, gameIds: args.gameIds }));
  if (args.csvPath) {
    const byLoser = loserIdsFromCsv(args.csvPath);
    for (const [userId, gameIds] of byLoser) {
      if (checks.some(c => c.userId === userId)) continue;
      checks.push({
        userId,
        gameIds: args.gameIds ?? (gameIds.size > 0 ? gameIds : undefined),
      });
    }
  }
  if (checks.length === 0) {
    console.error('Provide --userId and/or --from-csv');
    usage();
  }

  process.env.AWS_PROFILE = stage.profile;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const results = [];
  for (const { userId, gameIds } of checks) {
    const result = await verifyInflightClocksForUser(client, stage.table, userId, { gameIds });
    results.push(result);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(result);
    }
  }

  const totalFails = results.reduce((n, r) => n + r.failures.length, 0);
  if (!args.json) {
    console.log(`\nDone. ${results.length} user(s), ${totalFails} failure(s).`);
  }
  process.exit(totalFails > 0 ? 2 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
