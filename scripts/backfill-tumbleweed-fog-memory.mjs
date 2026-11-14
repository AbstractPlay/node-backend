#!/usr/bin/env node
/* eslint-env node */
/**
 * One-time refresh of fogMemory on every stack frame for games using the fog variant.
 *
 * Usage:
 *   npm run backfill-tumbleweed-fog -- --stage dev --dry-run
 *   npm run backfill-tumbleweed-fog -- --stage prod --apply --scope all
 *   npm run backfill-tumbleweed-fog -- --stage prod --dry-run --game-id 3a01b269-5047-4627-9445-e88bdc00b865
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  hydrateGameState,
  prepareGameStateForStorage,
  resolveVariantFieldsForGameRecord,
} from '../lib/gameState.ts';
import { refreshCompletedGameIndexes } from '../lib/gameProjector.ts';
import { matchesScope, TABLERO_BACKFILL_SCOPES } from './lib/tablero-stack-backfill.mjs';
import {
  patchTumbleweedFogMemory,
  recordUsesFogVariant,
} from './lib/tumbleweed-fog-backfill.mjs';

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
  console.error(`Usage: npx tsx scripts/backfill-tumbleweed-fog-memory.mjs --stage dev|prod [options]

Options:
  --stage dev|prod                    AWS profile + DynamoDB table (default: dev)
  --scope all|in-flight|completed     Which GAME rows to assess (default: all)
  --dry-run                           Print planned changes without writing (default)
  --apply                             Apply updates to DynamoDB
  --game-id <uuid>                    Only process this game id (optional)
  --limit <n>                         Stop after n updates assessed (optional)
  --help, -h                          Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;
  /** @type {import('./lib/tablero-stack-backfill.mjs').TableroBackfillScope} */
  let scope = 'all';
  /** @type {string | undefined} */
  let gameId;
  /** @type {number | undefined} */
  let limit;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--scope' && argv[i + 1]) {
      scope = argv[++i];
    } else if (arg === '--game-id' && argv[i + 1]) {
      gameId = argv[++i];
    } else if (arg === '--limit' && argv[i + 1]) {
      limit = Number(argv[++i]);
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

  if (!STAGES[stage]) {
    console.error(`Unknown stage: ${stage}`);
    usage();
  }
  if (!TABLERO_BACKFILL_SCOPES.includes(scope)) {
    console.error(`Unknown scope: ${scope} (expected ${TABLERO_BACKFILL_SCOPES.join('|')})`);
    usage();
  }

  return { stage, apply, scope, gameId, limit };
}

/** @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} docClient */
async function scanGameRows(docClient, tableName) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
      },
      ExpressionAttributeValues: {
        ':pk': 'GAME',
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

async function main() {
  const { stage, apply, scope, gameId, limit } = parseArgs(process.argv);
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
  if (gameId !== undefined) {
    console.log(`Game id filter: ${gameId}`);
  }

  const games = await scanGameRows(docClient, table);
  const fogGames = games.filter((item) => {
    if (!recordUsesFogVariant(item.variants, item.state)) {
      return false;
    }
    if (gameId !== undefined && item.id !== gameId) {
      return false;
    }
    return matchesScope(item, scope);
  });
  console.log(`Scanned ${games.length} GAME rows; fog variant in scope: ${fogGames.length}`);

  let needsUpdate = 0;
  let written = 0;
  let skipped = 0;
  let failed = 0;
  let assessed = 0;

  for (const item of fogGames) {
    if (limit !== undefined && assessed >= limit) {
      break;
    }
    assessed += 1;

    const metaGame = item.metaGame;
    const { variants, stateJson } = resolveVariantFieldsForGameRecord(
      metaGame ?? 'tumbleweed',
      item.state,
      item.variants,
    );

    const patch = patchTumbleweedFogMemory(stateJson);
    if (!patch.changed) {
      if (patch.reason !== undefined && patch.reason !== 'no fog variant' && patch.reason !== 'not tumbleweed') {
        failed += 1;
        console.warn(`SKIP ${item.id ?? item.sk}: ${patch.reason}`);
      } else {
        skipped += 1;
      }
      continue;
    }

    needsUpdate += 1;
    const idLabel = item.id ?? item.sk ?? '(unknown)';
    console.log(`UPDATE ${idLabel}: fogMemory stack replay (${patch.reason ?? 'changed'})`);

    if (!apply) {
      continue;
    }

    const updated = prepareGameStateForStorage({
      ...item,
      variants,
      state: patch.stateJson,
    });

    await docClient.send(new PutCommand({
      TableName: table,
      Item: updated,
    }));
    written += 1;

    if (typeof item.id === 'string') {
      const hydrated = hydrateGameState(updated);
      await refreshCompletedGameIndexes(docClient, table, hydrated);
    }
  }

  console.log('');
  console.log(
    `Assessed: ${assessed}; needs update: ${needsUpdate}; written: ${written}; `
    + `unchanged: ${skipped}; failed: ${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});