#!/usr/bin/env node
/* eslint-env node */
/**
 * Repair Generatorb (orb) GAME rows where lobby variants were lost from both
 * `variants` and serialized state (historical gameslib bug). Uses engine
 * inference from the opening board (requires gameslib with OrbGame fix).
 *
 * Amazons used the same pattern at read time: GAME `variants` patches empty
 * state JSON via hydrateGameState; records use resolveGameVariantUids(engine, GAME).
 * For orb, GAME.variants was often empty too, so this one-time scan persists
 * inferred uids on the GAME item.
 *
 * Usage:
 *   npx tsx scripts/backfill-orb-game-variants.mjs --stage dev --dry-run
 *   npx tsx scripts/backfill-orb-game-variants.mjs --stage prod --apply
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  decompressGameState,
  prepareGameStateForStorage,
  resolveVariantsForGameRecord,
} from '../lib/gameState.ts';

const META_GAME = 'orb';

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
  console.error(`Usage: npx tsx scripts/backfill-orb-game-variants.mjs --stage dev|prod [--dry-run|--apply]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --dry-run          Print planned changes without writing (default)
  --apply            Apply updates to DynamoDB
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
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

  return { stage, apply };
}

function variantsKey(variants) {
  return [...(variants ?? [])].sort().join('|');
}

async function scanOrbGames(docClient, tableName) {
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
  const { stage, apply } = parseArgs(process.argv);
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
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`);

  const games = await scanOrbGames(docClient, table);
  console.log(`Scanned ${games.length} GAME rows for metaGame=${META_GAME}`);

  let needsUpdate = 0;
  let written = 0;

  for (const item of games) {
    const beforeJson = decompressGameState(item.state);
    const { variants, stateJson } = resolveVariantsForGameRecord(
      META_GAME,
      item.state,
      item.variants,
    );

    const variantsChanged = variantsKey(variants) !== variantsKey(item.variants);
    const stateChanged = stateJson !== beforeJson;

    if (!variantsChanged && !stateChanged) {
      continue;
    }

    needsUpdate += 1;
    const sk = item.sk ?? '(unknown sk)';
    console.log(
      `UPDATE ${sk} variants ${JSON.stringify(item.variants ?? [])} -> ${JSON.stringify(variants)}`,
    );

    if (!apply) {
      continue;
    }

    const updated = prepareGameStateForStorage({
      ...item,
      variants,
      state: stateJson,
    });

    await docClient.send(new PutCommand({
      TableName: table,
      Item: updated,
    }));
    written += 1;
  }

  console.log(`Rows needing update: ${needsUpdate}; written: ${written}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
