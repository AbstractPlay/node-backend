#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill gameEndKind / gameEndPlayer / eogReason on existing COMPLETEDGAMES*
 * summary rows from completed GAME records.
 *
 * Usage:
 *   npx tsx scripts/backfill-completed-game-end-meta.mjs --stage dev --dry-run
 *   npx tsx scripts/backfill-completed-game-end-meta.mjs --stage prod --apply
 *   npx tsx scripts/backfill-completed-game-end-meta.mjs --stage dev --metaGame hex --apply
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { hydrateGameState } from '../lib/gameState.ts';
import {
  completedGameIndexSk,
  parseGameSk,
  refreshCompletedGameIndexes,
} from '../lib/gameProjector.ts';

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
  console.error(`Usage: npx tsx scripts/backfill-completed-game-end-meta.mjs --stage dev|prod [--metaGame <uid>] [--dry-run|--apply]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --metaGame <uid>   Only completed GAME rows for one meta-game
  --dry-run          Print planned updates (default)
  --apply            Rewrite COMPLETEDGAMES* summary rows
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;
  let metaGameFilter;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--metaGame' && argv[i + 1]) {
      metaGameFilter = argv[++i];
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

  return { stage, apply, metaGameFilter };
}

async function scanCompletedGames(docClient, tableName, metaGameFilter) {
  const items = [];
  let lastEvaluatedKey;

  const filterParts = ['#pk = :pk', 'attribute_exists(#ended)'];
  const names = {
    '#pk': 'pk',
    '#ended': 'gameEnded',
  };
  const values = {
    ':pk': 'GAME',
  };

  if (metaGameFilter) {
    filterParts.push('#mg = :mg');
    names['#mg'] = 'metaGame';
    values[':mg'] = metaGameFilter;
  }

  do {
    const page = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      const parsed = parseGameSk(String(item.sk ?? ''));
      if (parsed?.cbit === '1') {
        items.push(item);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function indexMissingEndMeta(
  docClient,
  tableName,
  lastMoveTime,
  gameId,
) {
  const sk = completedGameIndexSk(Number(lastMoveTime), gameId);
  const result = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'COMPLETEDGAMES', sk },
    ProjectionExpression: 'gameEndKind',
  }));
  if (!result.Item) {
    return 'no_index';
  }
  if (result.Item.gameEndKind !== undefined) {
    return 'has_meta';
  }
  return 'needs_update';
}

async function main() {
  const { stage, apply, metaGameFilter } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: backfill completed-game end meta on ${table}${metaGameFilter ? ` (meta ${metaGameFilter})` : ''}`,
  );

  const scanned = await scanCompletedGames(docClient, table, metaGameFilter);
  let skippedHasMeta = 0;
  let skippedNoIndex = 0;
  let planned = 0;
  let applied = 0;

  for (const raw of scanned) {
    const game = hydrateGameState(raw);
    if (!game?.id || game.lastMoveTime === undefined) {
      continue;
    }

    const status = await indexMissingEndMeta(
      docClient,
      table,
      game.lastMoveTime,
      game.id,
    );
    if (status === 'has_meta') {
      skippedHasMeta += 1;
      continue;
    }
    if (status === 'no_index') {
      skippedNoIndex += 1;
      continue;
    }

    planned += 1;
    const sk = completedGameIndexSk(game.lastMoveTime, game.id);
    console.log(`  update ${game.metaGame}#${game.id} sk=${sk}`);

    if (apply) {
      await refreshCompletedGameIndexes(docClient, table, game);
      applied += 1;
    }
  }

  console.log('');
  console.log(`Scanned completed GAME rows: ${scanned.length}`);
  console.log(`Planned summary rewrites: ${planned}`);
  console.log(`Skipped (already has gameEndKind): ${skippedHasMeta}`);
  console.log(`Skipped (no global COMPLETEDGAMES row): ${skippedNoIndex}`);
  if (apply) {
    console.log(`Applied: ${applied}`);
  } else if (planned > 0) {
    console.log('Re-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
