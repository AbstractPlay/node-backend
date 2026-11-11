#!/usr/bin/env node
/* eslint-env node */
/**
 * One-time patch for completed Chameleon games whose terminal move log mislabels EOG
 * (e.g. stalemate stored as annihilation).
 *
 * Usage:
 *   npm run backfill-chameleon-eog -- --stage dev --dry-run
 *   npm run backfill-chameleon-eog -- --stage prod --dry-run --scope completed
 *   npm run backfill-chameleon-eog -- --stage prod --apply --scope completed
 *
 * (Pass `--` before script flags so npm forwards `--scope`, etc.)
 *
 * On --apply, also calls refreshCompletedGameIndexes for each patched game id (stream
 * projector ignores state-only MODIFY on completed rows).
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
import { patchChameleonTerminalEogReason } from './lib/chameleon-eog-backfill.mjs';
import { matchesScope, TABLERO_BACKFILL_SCOPES } from './lib/tablero-stack-backfill.mjs';

const META_GAME = 'chameleon';

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
  console.error(`Usage: npx tsx scripts/backfill-chameleon-eog.mjs --stage dev|prod [options]

Options:
  --stage dev|prod                    AWS profile + DynamoDB table (default: dev)
  --scope all|in-flight|completed     Which GAME rows to assess (default: completed)
  --dry-run                           Print planned changes without writing (default)
  --apply                             Apply updates to DynamoDB
  --help, -h                          Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;
  /** @type {import('./lib/tablero-stack-backfill.mjs').TableroBackfillScope} */
  let scope = 'completed';

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

  return { stage, apply, scope };
}

async function scanChameleonGames(docClient, tableName) {
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

async function main() {
  const { stage, apply, scope } = parseArgs(process.argv);
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

  const games = await scanChameleonGames(docClient, table);
  const inScope = games.filter((item) => matchesScope(item, scope));
  console.log(`Scanned ${games.length} GAME rows for metaGame=${META_GAME}; in scope: ${inScope.length}`);

  let needsUpdate = 0;
  let written = 0;
  let indexRefreshed = 0;
  let failed = 0;
  /** @type {Array<{ id: string; from: string; to: string }>} */
  const changedGames = [];

  for (const item of inScope) {
    const gameId = typeof item.id === 'string' ? item.id : undefined;
    const { variants, stateJson } = resolveVariantFieldsForGameRecord(
      META_GAME,
      item.state,
      item.variants,
    );
    const patch = patchChameleonTerminalEogReason(stateJson);
    if (!patch.changed) {
      if (patch.reason?.startsWith('winner mismatch')) {
        failed += 1;
        console.warn(`FAILED ${item.sk ?? '(unknown sk)'}: ${patch.reason}`);
      }
      continue;
    }

    needsUpdate += 1;
    const sk = item.sk ?? '(unknown sk)';
    const idLabel = gameId ?? sk;
    console.log(`UPDATE ${idLabel}: eog ${patch.from} -> ${patch.to}`);
    if (gameId !== undefined) {
      changedGames.push({
        id: gameId,
        from: patch.from ?? '?',
        to: patch.to ?? '?',
      });
    } else {
      console.warn(`  (no item.id on ${sk}; skipped index-tracking)`);
    }

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

    if (gameId !== undefined) {
      const hydrated = hydrateGameState(updated);
      await refreshCompletedGameIndexes(docClient, table, hydrated);
      indexRefreshed += 1;
    }
  }

  console.log('');
  const indexLabel = apply ? `index refreshed: ${indexRefreshed}` : `index refresh planned: ${changedGames.length}`;
  console.log(`Rows needing update: ${needsUpdate}; GAME written: ${written}; ${indexLabel}; failed: ${failed}`);
  if (changedGames.length > 0) {
    console.log(`Changed game ids (${changedGames.length}):`);
    for (const row of changedGames) {
      console.log(`  ${row.id}  ${row.from} -> ${row.to}`);
    }
  } else {
    console.log('Changed game ids: (none)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
