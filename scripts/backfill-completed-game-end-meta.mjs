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
 *   npx tsx scripts/backfill-completed-game-end-meta.mjs --stage prod --metaGame yonkoma --refresh-gameEndPlayer --dry-run
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { queryPartitionItems } from './lib/ddb-query-partition.mjs';
import { assessCompletedIndexEndMeta } from './lib/completed-game-end-meta-backfill.mjs';
import { hydrateGameState } from '../lib/gameState.ts';
import { gameEndFieldsFromState } from '../lib/gameEndMeta.ts';
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
  --stage dev|prod           AWS profile + DynamoDB table (default: dev)
  --metaGame <uid>           Only completed GAME rows for one meta-game
  --refresh-gameEndPlayer    Also refresh rows that have gameEndKind but lack
                             gameEndPlayer while deriveGameEndMeta supplies one
                             (e.g. Yonkoma crosscut for {{player}} in EOG copy)
  --dry-run                  Print planned updates (default)
  --apply                    Rewrite COMPLETEDGAMES* summary rows
  --help, -h                 Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let apply = false;
  let metaGameFilter;
  let refreshGameEndPlayer = false;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--metaGame' && argv[i + 1]) {
      metaGameFilter = argv[++i];
    } else if (arg === '--refresh-gameEndPlayer') {
      refreshGameEndPlayer = true;
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

  return { stage, apply, metaGameFilter, refreshGameEndPlayer };
}

async function queryCompletedGames(docClient, tableName, metaGameFilter) {
  if (metaGameFilter) {
    /** Completed GAME rows use sk `{metaGame}#1#{gameId}` — Query, not Scan. */
    const skPrefix = `${metaGameFilter}#1#`;
    const names = { '#pk': 'pk', '#sk': 'sk', '#ended': 'gameEnded' };
    const values = { ':pk': 'GAME', ':skpfx': skPrefix };
    const items = [];
    let lastEvaluatedKey;
    do {
      const page = await docClient.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skpfx)',
        FilterExpression: 'attribute_exists(#ended)',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      items.push(...(page.Items ?? []));
      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return items.filter((item) => parseGameSk(String(item.sk ?? ''))?.cbit === '1');
  }

  const raw = await queryPartitionItems(docClient, tableName, 'GAME', {
    filterExpression: 'attribute_exists(#ended)',
    expressionAttributeNames: { '#ended': 'gameEnded' },
  });
  return raw.filter((item) => parseGameSk(String(item.sk ?? ''))?.cbit === '1');
}

async function assessIndexForGame(
  docClient,
  tableName,
  game,
  refreshGameEndPlayer,
) {
  const sk = completedGameIndexSk(Number(game.lastMoveTime), game.id);
  const result = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'COMPLETEDGAMES', sk },
    ProjectionExpression: 'gameEndKind, gameEndPlayer, eogReason',
  }));
  const derived = gameEndFieldsFromState(game.metaGame, game.state);
  return {
    status: assessCompletedIndexEndMeta(result.Item, derived, refreshGameEndPlayer),
    derived,
    index: result.Item,
  };
}

async function main() {
  const { stage, apply, metaGameFilter, refreshGameEndPlayer } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: backfill completed-game end meta on ${table}${metaGameFilter ? ` (meta ${metaGameFilter})` : ''}${refreshGameEndPlayer ? ' [refresh-gameEndPlayer]' : ''}`,
  );

  const queried = await queryCompletedGames(docClient, table, metaGameFilter);
  let skippedHasMeta = 0;
  let skippedNoIndex = 0;
  let planned = 0;
  let applied = 0;

  for (const raw of queried) {
    const game = hydrateGameState(raw);
    if (!game?.id || game.lastMoveTime === undefined) {
      continue;
    }

    const { status, derived, index } = await assessIndexForGame(
      docClient,
      table,
      game,
      refreshGameEndPlayer,
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
    const detail = derived?.gameEndPlayer !== undefined
      ? ` gameEndPlayer ${index?.gameEndPlayer ?? '(missing)'} -> ${derived.gameEndPlayer}`
      : '';
    console.log(`  update ${game.metaGame}#${game.id} sk=${sk}${detail}`);

    if (apply) {
      await refreshCompletedGameIndexes(docClient, table, game);
      applied += 1;
    }
  }

  console.log('');
  console.log(`Queried completed GAME rows: ${queried.length}`);
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
