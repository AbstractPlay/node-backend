#!/usr/bin/env node
/* eslint-env node */
/**
 * Dump arena post-game feedback rows (ARENAFB#*) as JSONL.
 *
 *   node scripts/dump-arena-feedback.mjs [--stage dev|prod] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd.
 */
import { createWriteStream } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const PK_PREFIX = 'ARENAFB#';

const STAGES = {
  dev: { profile: 'AbstractPlayDev', table: 'abstract-play-dev' },
  prod: { profile: 'AbstractPlayProd', table: 'abstract-play-prod' },
};

function usage() {
  console.error(`Usage: node scripts/dump-arena-feedback.mjs [options]

Options:
  --stage dev|prod     Table + profile (default: dev)
  --from YYYY-MM-DD    Inclusive UTC start (server ts)
  --to YYYY-MM-DD      Inclusive UTC end
  --out <path>         Write to file (default: stdout)
  --help, -h
`);
  process.exit(1);
}

function parseDateKey(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`Invalid ${label}: ${value}`);
    usage();
  }
  const [y, m, d] = value.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function parseArgs(argv) {
  let stage = 'dev';
  let fromMs;
  let toMs;
  let outPath;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--stage' && argv[i + 1]) stage = argv[++i];
    else if (arg === '--from' && argv[i + 1]) fromMs = parseDateKey(argv[++i], '--from');
    else if (arg === '--to' && argv[i + 1]) {
      const start = parseDateKey(argv[++i], '--to');
      toMs = start + 86_400_000 - 1;
    } else if (arg === '--out' && argv[i + 1]) outPath = argv[++i];
    else usage();
  }

  if (!STAGES[stage]) {
    console.error(`Invalid --stage: ${stage}`);
    usage();
  }
  return { stage, fromMs, toMs, outPath };
}

function exportRow(item) {
  return {
    ts: item.ts,
    userId: String(item.pk).slice(PK_PREFIX.length),
    metaGame: item.metaGame,
    gameId: item.gameId,
    arenaTcId: item.arenaTcId,
    tier: item.tier,
    clockFairness: item.clockFairness,
    responsiveness: item.responsiveness,
    tcFit: item.tcFit,
    unfairFlag: item.unfairFlag,
    queueAgain: item.queueAgain,
    comment: item.comment,
  };
}

async function main() {
  const { stage, fromMs, toMs, outPath } = parseArgs(process.argv);
  const cfg = STAGES[stage];
  process.env.AWS_PROFILE = cfg.profile;

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const out = outPath ? createWriteStream(outPath, { encoding: 'utf8' }) : process.stdout;
  let count = 0;
  let lastKey;

  do {
    const page = await doc.send(new ScanCommand({
      TableName: cfg.table,
      FilterExpression: 'begins_with(#pk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':prefix': PK_PREFIX },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of page.Items ?? []) {
      const ts = Number(item.ts);
      if (fromMs !== undefined && ts < fromMs) continue;
      if (toMs !== undefined && ts > toMs) continue;
      out.write(`${JSON.stringify(exportRow(item))}\n`);
      count++;
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  if (outPath) {
    out.end();
  }
  console.error(`\nWrote ${count} arena feedback row(s) (${stage}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
