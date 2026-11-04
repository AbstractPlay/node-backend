#!/usr/bin/env node
/* eslint-env node */
/**
 * Audit and repair Tablero GAME rows with legacy stack corruption (shared board arrays,
 * duplicate pass frames after doubles takes).
 *
 * Usage:
 *   npm run backfill-tablero-stack -- --stage dev --dry-run --scope all
 *   npm run backfill-tablero-stack -- --stage prod --dry-run --scope in-flight
 *   npm run backfill-tablero-stack -- --stage prod --apply --scope all
 */
import { createWriteStream } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  repairTableroStackJson,
  verifyTableroStackIntegrity,
} from '@abstractplay/gameslib';
import {
  decompressGameState,
  prepareGameStateForStorage,
  resolveVariantFieldsForGameRecord,
} from '../lib/gameState.ts';
import {
  assessTableroRow,
  auditCsvHeader,
  formatAuditCsvLine,
  matchesScope,
  TABLERO_BACKFILL_SCOPES,
} from './lib/tablero-stack-backfill.mjs';

const META_GAME = 'tablero';

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
  console.error(`Usage: npx tsx scripts/backfill-tablero-stack.mjs --stage dev|prod [options]

Options:
  --stage dev|prod              AWS profile + DynamoDB table (default: dev)
  --scope all|in-flight|completed   Which GAME rows to assess (default: all)
  --dry-run                     Print summary + CSV; no writes (default)
  --apply                       Apply updates to DynamoDB
  --audit-csv PATH              Audit CSV path (default: tablero-stack-audit-<stage>.csv)
  --unreplayable-csv PATH       Unreplayable rows (default: tablero-stack-unreplayable-<stage>.csv)
  --help, -h                    Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;
  /** @type {import('./lib/tablero-stack-backfill.mjs').TableroBackfillScope} */
  let scope = 'all';
  let auditCsv;
  let unreplayableCsv;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--scope' && argv[i + 1]) {
      scope = argv[++i];
    } else if (arg === '--dry-run') {
      apply = false;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--audit-csv' && argv[i + 1]) {
      auditCsv = argv[++i];
    } else if (arg === '--unreplayable-csv' && argv[i + 1]) {
      unreplayableCsv = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }
  if (!TABLERO_BACKFILL_SCOPES.includes(scope)) {
    console.error(`Unknown scope: ${scope} (expected ${TABLERO_BACKFILL_SCOPES.join('|')})`);
    usage();
  }

  return {
    stage,
    apply,
    scope,
    auditCsv: auditCsv ?? `tablero-stack-audit-${stage}.csv`,
    unreplayableCsv: unreplayableCsv ?? `tablero-stack-unreplayable-${stage}.csv`,
  };
}

async function scanTableroGames(docClient, tableName) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk AND #mg = :mg',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#mg': 'metaGame',
      },
      ExpressionAttributeValues: {
        ':pk': 'GAME',
        ':mg': META_GAME,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

const deps = {
  metaGame: META_GAME,
  decompressGameState,
  resolveVariantFieldsForGameRecord,
  verifyTableroStackIntegrity,
  repairTableroStackJson,
  prepareGameStateForStorage,
};

async function main() {
  const { stage, apply, scope, auditCsv, unreplayableCsv } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }), {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
    },
  });

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Scope: ${scope}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`);
  console.log(`Audit CSV: ${auditCsv}`);
  console.log(`Unreplayable CSV: ${unreplayableCsv}`);

  const games = await scanTableroGames(docClient, table);
  const inScope = games.filter((item) => matchesScope(item, scope));
  console.log(`Scanned ${games.length} GAME rows for metaGame=${META_GAME}; ${inScope.length} in scope`);

  const auditStream = createWriteStream(auditCsv, { encoding: 'utf8' });
  auditStream.write(`${auditCsvHeader()}\n`);
  const unreplayableStream = createWriteStream(unreplayableCsv, { encoding: 'utf8' });
  unreplayableStream.write(`${auditCsvHeader()}\n`);

  let needsUpdate = 0;
  let written = 0;
  let verifyFail = 0;
  let unreplayable = 0;
  /** @type {Record<string, number>} */
  const classCounts = {};

  for (const item of inScope) {
    const row = assessTableroRow(item, deps);
    if (!row.verifyOk) {
      verifyFail += 1;
    }
    classCounts[row.failureClass] = (classCounts[row.failureClass] ?? 0) + 1;
    if (row.unreplayable) {
      unreplayable += 1;
      unreplayableStream.write(`${formatAuditCsvLine(row)}\n`);
    }
    if (!row.verifyOk || row.needsUpdate) {
      auditStream.write(`${formatAuditCsvLine(row)}\n`);
    }

    if (!row.needsUpdate) {
      continue;
    }

    needsUpdate += 1;
    console.log(`UPDATE ${row.sk}${row.repairChanged ? ' (stack repair)' : ''}`);

    if (!apply) {
      continue;
    }

    await docClient.send(new PutCommand({
      TableName: table,
      Item: row.stored,
    }));
    written += 1;
  }

  auditStream.end();
  unreplayableStream.end();

  console.log([
    `Verify failed: ${verifyFail}`,
    `Need update: ${needsUpdate}`,
    `Unreplayable (genuine): ${unreplayable}`,
    `Written: ${written}`,
  ].join('; '));
  console.log('Failure classes:', classCounts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
