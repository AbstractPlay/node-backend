#!/usr/bin/env node
/* eslint-env node */
/**
 * Rectify USER.vacationClockStints for players who stopped vacation before the
 * overlap fix shipped. Old stop/finalize cleared live stint fields and only
 * wrote vacationPauseMsUsed — no clock history — so in-flight games charged
 * full wall time until USER rows are backfilled. Completed false timeouts are
 * unchanged; this only fixes live clocks (and prevents further bad sweeps).
 *
 * Usage:
 *   npx tsx scripts/backfill-vacation-clock-stints.mjs --stage prod --from-csv vacation-stop-clock-incidents.csv --dry-run
 *   npx tsx scripts/backfill-vacation-clock-stints.mjs --stage prod --from-csv vacation-stop-clock-incidents.csv --apply
 *   npx tsx scripts/backfill-vacation-clock-stints.mjs --stage prod --userId <uuid> --pause-start-ms <ms> --pause-end-ms <ms> --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  appendVacationClockStint,
  vacationClockStintDynamoValue,
  vacationClockStintsFromItem,
} from '../lib/vacation/clockStints.ts';
import { vacationFieldsFromUserItem } from '../lib/vacation/load.ts';

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
  console.error(`Usage: npx tsx scripts/backfill-vacation-clock-stints.mjs [options]

Options:
  --stage dev|prod          AWS profile + table (default: dev)
  --from-csv <path>         One stint per loserId: pauseEnd=min(gameEnded), duration=pauseMsCharged
  --discover                List USER rows with vacationPauseMsUsed>=min but no vacationClockStints (no writes)
  --min-pause-hours <n>     For --discover (default: 1)
  --userId <uuid>           Manual stint (repeatable with multiple manual blocks below)
  --pause-start-ms <ms>     With --userId (or ISO via --pause-start)
  --pause-end-ms <ms>       With --userId
  --pause-start <iso>       Alternative to --pause-start-ms
  --pause-end <iso>
  --dry-run                 Print planned USER updates (default)
  --apply                   Write vacationClockStints
  --help, -h
`);
  process.exit(1);
}

function parseCsvStints(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return new Map();
  }
  const header = lines[0].split(',');
  const idx = {
    loserId: header.indexOf('loserId'),
    gameEnded: header.indexOf('gameEnded'),
    pauseMsCharged: header.indexOf('pauseMsCharged'),
    loserName: header.indexOf('loserName'),
  };
  if (idx.loserId < 0 || idx.gameEnded < 0 || idx.pauseMsCharged < 0) {
    throw new Error(`CSV missing columns; need loserId, gameEnded, pauseMsCharged`);
  }

  const byUser = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    const loserId = cols[idx.loserId];
    const gameEnded = Number(cols[idx.gameEnded]);
    const pauseMs = Number(cols[idx.pauseMsCharged]);
    const loserName = idx.loserName >= 0 ? cols[idx.loserName] : '';
    if (!loserId || !Number.isFinite(gameEnded) || !Number.isFinite(pauseMs) || pauseMs <= 0) {
      continue;
    }
    let row = byUser.get(loserId);
    if (!row) {
      row = { loserName, minGameEnded: gameEnded, pauseMsCharged: pauseMs };
      byUser.set(loserId, row);
    } else {
      row.minGameEnded = Math.min(row.minGameEnded, gameEnded);
      row.pauseMsCharged = Math.max(row.pauseMsCharged, pauseMs);
      if (loserName && !row.loserName) {
        row.loserName = loserName;
      }
    }
  }

  const stints = new Map();
  for (const [userId, row] of byUser) {
    const pauseEnd = row.minGameEnded;
    const pauseStart = pauseEnd - row.pauseMsCharged;
    if (pauseStart >= pauseEnd) {
      continue;
    }
    stints.set(userId, {
      userId,
      loserName: row.loserName,
      pauseStart,
      pauseEnd,
      pauseMsCharged: row.pauseMsCharged,
      source: 'incident-csv',
    });
  }
  return stints;
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;
  let discover = false;
  let minPauseMs = 3_600_000;
  let csvPath;
  const manualStints = [];
  let pendingManual = null;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--from-csv' && argv[i + 1]) {
      csvPath = argv[++i];
    } else if (arg === '--userId' && argv[i + 1]) {
      if (pendingManual) {
        manualStints.push(pendingManual);
      }
      pendingManual = { userId: argv[++i] };
    } else if (arg === '--pause-start-ms' && argv[i + 1] && pendingManual) {
      pendingManual.pauseStart = Number(argv[++i]);
    } else if (arg === '--pause-end-ms' && argv[i + 1] && pendingManual) {
      pendingManual.pauseEnd = Number(argv[++i]);
    } else if (arg === '--pause-start' && argv[i + 1] && pendingManual) {
      pendingManual.pauseStart = Date.parse(argv[++i]);
    } else if (arg === '--pause-end' && argv[i + 1] && pendingManual) {
      pendingManual.pauseEnd = Date.parse(argv[++i]);
    } else if (arg === '--discover') {
      discover = true;
    } else if (arg === '--min-pause-hours' && argv[i + 1]) {
      minPauseMs = Number(argv[++i]) * 3_600_000;
    } else if (arg === '--dry-run') {
      apply = false;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (pendingManual) {
    manualStints.push(pendingManual);
  }

  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }

  return { stage, apply, discover, minPauseMs, csvPath, manualStints };
}

async function discoverUsersNeedingBackfill(docClient, tableName, minPauseMs) {
  const out = [];
  let lastKey;
  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk AND vacationPauseMsUsed >= :min',
      ExpressionAttributeNames: { '#pk': 'pk', '#name': 'name' },
      ExpressionAttributeValues: {
        ':pk': 'USER',
        ':min': minPauseMs,
      },
      ProjectionExpression: 'sk, #name, vacationPauseMsUsed, vacationClockStints, vacationStartsAt',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of page.Items ?? []) {
      const stints = vacationClockStintsFromItem(item);
      if (stints.length > 0 || item.vacationStartsAt !== undefined) {
        continue;
      }
      out.push({
        userId: item.sk,
        name: item.name,
        vacationPauseMsUsed: item.vacationPauseMsUsed,
      });
    }
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

function stintAlreadyRecorded(existing, pauseStart, pauseEnd) {
  const tolerance = 60_000;
  return existing.some(
    s => Math.abs(s.pauseStart - pauseStart) <= tolerance
      && Math.abs(s.pauseEnd - pauseEnd) <= tolerance,
  );
}

async function planUserUpdate(docClient, tableName, stint) {
  const data = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: stint.userId },
      ProjectionExpression: 'vacationClockStints, vacationPauseMsUsed, #name',
      ExpressionAttributeNames: { '#name': 'name' },
    }),
  );
  if (!data.Item) {
    return { ok: false, reason: 'user_not_found', stint };
  }
  const fields = vacationFieldsFromUserItem(data.Item);
  const existing = vacationClockStintsFromItem(data.Item);
  const pauseUsed = data.Item.vacationPauseMsUsed;
  const stintMs = stint.pauseEnd - stint.pauseStart;
  if (typeof pauseUsed === 'number' && pauseUsed > 0) {
    const tolerance = Math.max(60_000, stintMs * 0.05);
    if (Math.abs(pauseUsed - stintMs) > tolerance) {
      return {
        ok: true,
        warn: 'pause_ms_used_mismatch',
        stint,
        name: data.Item.name ?? stint.loserName,
        pauseMsUsed: pauseUsed,
        stintMs,
        beforeCount: existing.length,
        afterCount: existing.length,
        vacationClockStints: vacationClockStintDynamoValue(existing),
      };
    }
  }
  if (stintAlreadyRecorded(existing, stint.pauseStart, stint.pauseEnd)) {
    return {
      ok: false,
      reason: 'already_recorded',
      stint,
      name: data.Item.name,
      existingCount: existing.length,
    };
  }
  const now = Date.now();
  const merged = appendVacationClockStint(
    fields,
    stint.pauseStart,
    stint.pauseEnd,
    now,
  );
  return {
    ok: true,
    stint,
    name: data.Item.name ?? stint.loserName,
    pauseMsUsed: data.Item.vacationPauseMsUsed,
    beforeCount: existing.length,
    afterCount: merged.length,
    vacationClockStints: vacationClockStintDynamoValue(merged),
  };
}

async function main() {
  const {
    stage,
    apply,
    discover,
    minPauseMs,
    csvPath,
    manualStints,
  } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  if (discover) {
    const users = await discoverUsersNeedingBackfill(docClient, table, minPauseMs);
    console.log(`USER rows with vacationPauseMsUsed>=${minPauseMs / 3_600_000}h, no stint, not on vacation: ${users.length}`);
    for (const u of users) {
      const h = (u.vacationPauseMsUsed / 3_600_000).toFixed(2);
      console.log(`${u.name ?? '?'}\t${u.userId}\tused=${h}h`);
    }
    console.error('Backfill with --from-csv, or --userId + pause-start/end (stop time minus used ms).');
    return;
  }

  const plan = new Map();

  if (csvPath) {
    const resolved = path.isAbsolute(csvPath)
      ? csvPath
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', csvPath);
    for (const [userId, stintRow] of parseCsvStints(resolved)) {
      plan.set(userId, stintRow);
    }
  }

  for (const m of manualStints) {
    if (!m.userId || !Number.isFinite(m.pauseStart) || !Number.isFinite(m.pauseEnd)) {
      console.error('Incomplete manual stint:', m);
      usage();
    }
    plan.set(m.userId, {
      userId: m.userId,
      pauseStart: m.pauseStart,
      pauseEnd: m.pauseEnd,
      source: 'manual',
    });
  }

  if (plan.size === 0) {
    console.error('No stints to apply; use --from-csv or --userId with pause times.');
    usage();
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'}: backfill vacationClockStints on ${table} (${plan.size} user(s))`);

  for (const stintRow of plan.values()) {
    const result = await planUserUpdate(docClient, table, stintRow);
    if (!result.ok) {
      console.log(
        `SKIP ${stintRow.userId} (${result.name ?? stintRow.loserName ?? '?'}): ${result.reason}`,
      );
      continue;
    }
    if (result.warn === 'pause_ms_used_mismatch') {
      console.log(
        `WARN ${stintRow.userId}: stint ${result.stintMs}ms vs vacationPauseMsUsed=${result.pauseMsUsed} — use manual pause times`,
      );
      continue;
    }
    const durationH = ((stintRow.pauseEnd - stintRow.pauseStart) / 3_600_000).toFixed(2);
    console.log(
      `${apply ? 'APPLY' : 'PLAN'} ${result.name ?? stintRow.loserName} ${stintRow.userId}`,
    );
    console.log(`  source=${stintRow.source} stint=${durationH}h `
      + `[${stintRow.pauseStart} .. ${stintRow.pauseEnd}] `
      + `stints ${result.beforeCount} -> ${result.afterCount} `
      + `(vacationPauseMsUsed=${result.pauseMsUsed ?? '?'})`);

    if (apply) {
      await docClient.send(
        new UpdateCommand({
          TableName: table,
          Key: { pk: 'USER', sk: stintRow.userId },
          UpdateExpression: 'SET vacationClockStints = :stints',
          ExpressionAttributeValues: {
            ':stints': result.vacationClockStints,
          },
        }),
      );
    }
  }
}

await main();
