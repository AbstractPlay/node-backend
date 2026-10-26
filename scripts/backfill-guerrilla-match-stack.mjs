#!/usr/bin/env node
/* eslint-env node */
/**
 * Repair Guerrilla Checkers match GAME rows with legacy combined G1?G2 stack frames.
 *
 * Usage:
 *   npx tsx scripts/backfill-guerrilla-match-stack.mjs --stage dev --dry-run
 *   npx tsx scripts/backfill-guerrilla-match-stack.mjs --stage prod --apply
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
import { repairGuerrillaMatchStackJson } from '@abstractplay/gameslib';

const META_GAME = 'guerrilla';

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
  console.error(`Usage: npx tsx scripts/backfill-guerrilla-match-stack.mjs --stage dev|prod [--dry-run|--apply]

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

async function scanGuerrillaGames(docClient, tableName) {
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

  const games = await scanGuerrillaGames(docClient, table);
  console.log(`Scanned ${games.length} GAME rows for metaGame=${META_GAME}`);

  let needsUpdate = 0;
  let written = 0;
  let failed = 0;

  for (const item of games) {
    const beforeJson = decompressGameState(item.state);
    const { variants, stateJson: variantJson } = resolveVariantsForGameRecord(
      META_GAME,
      item.state,
      item.variants,
    );
    const { stateJson: repairedJson, repaired, reason } = repairGuerrillaMatchStackJson(variantJson);

    if (!repaired && reason !== undefined && reason.startsWith('could not infer')) {
      failed += 1;
      console.warn(`FAILED ${item.sk ?? '(unknown sk)'}: ${reason}`);
      continue;
    }

    const stateChanged = repairedJson !== beforeJson;
    const variantsChanged = JSON.stringify(variants ?? []) !== JSON.stringify(item.variants ?? []);

    if (!stateChanged && !variantsChanged) {
      continue;
    }

    needsUpdate += 1;
    const sk = item.sk ?? '(unknown sk)';
    console.log(`UPDATE ${sk}${repaired ? ' (stack repair)' : ''}`);

    if (!apply) {
      continue;
    }

    const updated = prepareGameStateForStorage({
      ...item,
      variants,
      state: repairedJson,
    });

    await docClient.send(new PutCommand({
      TableName: table,
      Item: updated,
    }));
    written += 1;
  }

  console.log(`Rows needing update: ${needsUpdate}; written: ${written}; failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
