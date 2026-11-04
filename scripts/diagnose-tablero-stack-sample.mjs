#!/usr/bin/env node
/* eslint-env node */
/**
 * Sample Tablero rows from an audit/unreplayable CSV and diagnose stack integrity via DynamoDB.
 *
 *   npx tsx scripts/diagnose-tablero-stack-sample.mjs --stage prod --csv tablero-stack-unreplayable-prod.csv
 */
import fs from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { diagnoseTableroStackIntegrity, repairTableroStackJson } from '@abstractplay/gameslib';
import { decompressGameState, resolveVariantFieldsForGameRecord } from '../lib/gameState.ts';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

/** @param {string} line @param {string[]} hdr */
function parseCsvLine(line, hdr) {
  const parts = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  /** @type {Record<string, string>} */
  const o = {};
  hdr.forEach((h, i) => {
    o[h] = parts[i] ?? '';
  });
  return o;
}

/** @param {string} text */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const hdr = lines[0].split(',');
  return lines.slice(1).filter(Boolean).map((l) => parseCsvLine(l, hdr));
}

/**
 * @param {ReturnType<typeof parseCsv>} rows
 * @param {number} maxPerBucket
 */
function stratifiedSample(rows, maxPerBucket) {
  /** @type {Map<string, typeof rows>} */
  const buckets = new Map();
  for (const row of rows) {
    const key = row.in_flight === 'yes' ? 'in_flight' : (row.reason?.includes('(board, pieces)') ? 'board_pieces' : 'board_only');
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(row);
  }
  /** @type {typeof rows} */
  const picked = [];
  const seen = new Set();
  for (const [, bucket] of buckets) {
    for (const row of bucket.slice(0, maxPerBucket)) {
      if (seen.has(row.sk)) continue;
      seen.add(row.sk);
      picked.push(row);
    }
  }
  const rest = rows.filter((r) => !seen.has(r.sk));
  for (let i = 0; i < rest.length && picked.length < maxPerBucket * 4; i += Math.max(1, Math.floor(rest.length / 12))) {
    const row = rest[i];
    if (seen.has(row.sk)) continue;
    seen.add(row.sk);
    picked.push(row);
  }
  return picked;
}

function parseArgs(argv) {
  let stage = 'prod';
  let csv = 'tablero-stack-unreplayable-prod.csv';
  let limit = 8;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) stage = argv[++i];
    else if (arg === '--csv' && argv[i + 1]) csv = argv[++i];
    else if (arg === '--limit' && argv[i + 1]) limit = Number(argv[++i]);
  }
  return { stage, csv, limit };
}

async function main() {
  const { stage, csv, limit } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];
  const rows = parseCsv(fs.readFileSync(csv, 'utf8'));
  const sample = stratifiedSample(rows, limit);
  console.log(`CSV rows: ${rows.length}; diagnosing ${sample.length} sampled SKs from ${csv} (${stage})`);

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  /** @type {Record<string, number>} */
  const totals = {
    tipSnapshotRepairCandidate: 0,
    replaySelfVerifyOk: 0,
    replaySelfVerifyFail: 0,
    duplicatePass: 0,
  };

  for (const row of sample) {
    const sk = row.sk;
    const got = await docClient.send(new GetCommand({
      TableName: table,
      Key: { pk: 'GAME', sk },
    }));
    if (!got.Item?.state) {
      console.log(`\n${sk}: MISSING`);
      continue;
    }
    const { stateJson } = resolveVariantFieldsForGameRecord(
      'tablero',
      String(got.Item.state),
      /** @type {string[] | undefined} */ (got.Item.variants),
    );
    const json = decompressGameState(stateJson);
    const d = diagnoseTableroStackIntegrity(json);
    if (d.tipSnapshotRepairCandidate) totals.tipSnapshotRepairCandidate += 1;
    if (d.replaySelfVerifyOk) totals.replaySelfVerifyOk += 1;
    else totals.replaySelfVerifyFail += 1;
    if (d.legacyDuplicatePassFrames > 0) totals.duplicatePass += 1;

    console.log([
      `\n${sk}`,
      `  in_flight=${row.in_flight} csv_reason=${row.reason?.slice(0, 60)}`,
      `  verify=${d.verifyOk ? 'ok' : 'FAIL'} ${d.verifyReason ?? ''}`,
      `  playableMismatch=[${d.playableMismatch.join(', ')}]`,
      `  pieces stored=${d.storedTipPieces.join('/')} replay=${d.replayTipPieces.join('/')}`,
      `  boardCells stored=${d.storedBoardCells} replay=${d.replayBoardCells} firstDiff=${d.firstBoardDiff ?? '-'}`,
      `  stackLen stored=${d.storedStackLen} replay=${d.replayStackLen} dupPass=${d.legacyDuplicatePassFrames}`,
      `  replaySelfVerify=${d.replaySelfVerifyOk ? 'ok' : 'FAIL'} tipSnapshotRepair=${d.tipSnapshotRepairCandidate ? 'YES' : 'no'}`,
    ].join('\n'));
    const repaired = repairTableroStackJson(json);
    console.log(`  repair=${repaired.repaired ? 'OK' : 'no'} ${repaired.reason ?? ''}`);
  }

  console.log('\n--- sample totals ---');
  console.log(JSON.stringify(totals, null, 2));
  console.log(
    'If tipSnapshotRepairCandidate ≈ sample size, prod tip_mismatch rows are likely fixable by replay replacement (deploy repair + re-audit).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
