#!/usr/bin/env node
/* eslint-env node */
/**
 * Dump Game Move layout usage events (LAYOUTEVT#*) as JSONL.
 *
 * Usage:
 *   node bin/dump-gamemove-layout-events.mjs [--stage dev|prod]
 *     [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *     [--event session_start|layout_switch]
 *     [--out path.jsonl] [--format jsonl|json]
 *
 * Defaults: all time, JSONL to stdout. Date filters use UTC calendar days on server `ts`.
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { createWriteStream } from 'fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const LAYOUT_EVT_PK_PREFIX = 'LAYOUTEVT#';

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

const EVENT_TYPES = new Set(['session_start', 'layout_switch']);

function usage() {
  console.error(`Usage: node bin/dump-gamemove-layout-events.mjs [options]

Options:
  --stage dev|prod              AWS profile + DynamoDB table (default: dev)
  --from YYYY-MM-DD             Inclusive UTC start date (server ts)
  --to YYYY-MM-DD               Inclusive UTC end date (server ts)
  --event session_start|layout_switch   Filter by event type
  --out <path>                  Write output to file (default: stdout)
  --format jsonl|json           Output format (default: jsonl)
  --help, -h                    Show this help
`);
  process.exit(1);
}

function parseDateKey(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`Invalid ${label} date: ${value}`);
    usage();
  }
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function parseArgs(argv) {
  let stage = 'dev';
  let fromMs;
  let toMs;
  let eventFilter;
  let outPath;
  let format = 'jsonl';

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
    } else if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--from' && argv[i + 1]) {
      fromMs = parseDateKey(argv[++i], '--from');
    } else if (arg === '--to' && argv[i + 1]) {
      const dayStart = parseDateKey(argv[++i], '--to');
      toMs = dayStart + 86_400_000 - 1;
    } else if (arg === '--event' && argv[i + 1]) {
      eventFilter = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (arg === '--format' && argv[i + 1]) {
      format = argv[++i];
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!STAGES[stage]) {
    console.error(`Invalid --stage: ${stage}`);
    usage();
  }
  if (eventFilter && !EVENT_TYPES.has(eventFilter)) {
    console.error(`Invalid --event: ${eventFilter}`);
    usage();
  }
  if (format !== 'jsonl' && format !== 'json') {
    console.error(`Invalid --format: ${format}`);
    usage();
  }
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
    console.error('--from must be on or before --to');
    usage();
  }

  return { stage, fromMs, toMs, eventFilter, outPath, format };
}

function exportRecord(item) {
  return {
    ts: item.ts,
    event: item.event,
    layout: item.layout,
    resolvedFrom: item.resolvedFrom,
    storedLayout: item.storedLayout,
    viewportWidth: item.viewportWidth,
    metaGame: item.metaGame,
    sessionId: item.sessionId,
    isLoggedIn: item.isLoggedIn,
    userHash: item.userHash,
    from: item.from,
    to: item.to,
  };
}

function matchesFilters(item, { fromMs, toMs, eventFilter }) {
  const ts = typeof item.ts === 'number' ? item.ts : Number(String(item.sk).split('#')[0]);
  if (!Number.isFinite(ts)) {
    return false;
  }
  if (fromMs !== undefined && ts < fromMs) {
    return false;
  }
  if (toMs !== undefined && ts > toMs) {
    return false;
  }
  if (eventFilter && item.event !== eventFilter) {
    return false;
  }
  return true;
}

async function scanLayoutEvents(docClient, tableName) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(#pk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':prefix': LAYOUT_EVT_PK_PREFIX },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;

    if (items.length > 0 && items.length % 1000 === 0) {
      process.stderr.write(`\r  scanned layout events: ${items.length}`);
    }
  } while (lastEvaluatedKey);

  if (items.length >= 1000) {
    process.stderr.write('\n');
  }

  return items;
}

async function writeOutput(records, { outPath, format }) {
  const lines = records.map(record => JSON.stringify(record));
  const payload = format === 'json'
    ? `${JSON.stringify(records, null, 2)}\n`
    : `${lines.join('\n')}${lines.length ? '\n' : ''}`;

  if (outPath) {
    await new Promise((resolve, reject) => {
      const stream = createWriteStream(outPath, { encoding: 'utf8' });
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(payload);
    });
    return;
  }

  process.stdout.write(payload);
}

async function main() {
  const { stage, fromMs, toMs, eventFilter, outPath, format } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const client = new DynamoDBClient({
    region: 'us-east-1',
    profile,
  });
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });

  console.error(`Stage: ${stage}`);
  console.error(`Table: ${table}`);
  console.error(`Profile: ${profile}`);
  if (fromMs !== undefined) {
    console.error(`From (UTC): ${new Date(fromMs).toISOString()}`);
  }
  if (toMs !== undefined) {
    console.error(`To (UTC): ${new Date(toMs).toISOString()}`);
  }
  if (eventFilter) {
    console.error(`Event filter: ${eventFilter}`);
  }

  const items = await scanLayoutEvents(docClient, table);
  const records = items
    .filter(item => matchesFilters(item, { fromMs, toMs, eventFilter }))
    .map(exportRecord)
    .sort((a, b) => a.ts - b.ts);

  await writeOutput(records, { outPath, format });
  console.error(`Wrote ${records.length} layout event(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
