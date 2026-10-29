#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill COMPLETEDGAMES* index rows and METAGAMES completedgames counts for
 * finished arena games that predated indexArenaCompletedGame on game end.
 *
 * Idempotent: skips games that already have a global COMPLETEDGAMES row at
 * lastMoveTime#id (same key the stream projector uses).
 *
 * Usage:
 *   npx tsx scripts/backfill-arena-completed-index.mjs --stage dev --dry-run
 *   npx tsx scripts/backfill-arena-completed-index.mjs --stage prod --apply
 *   npx tsx scripts/backfill-arena-completed-index.mjs --stage dev --metaGame hex --apply
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { hydrateGameState } from '../lib/gameState.ts';
import { isArenaGame } from '../lib/gamePlayMode.ts';
import {
  completedGameIndexSk,
  indexArenaCompletedGame,
  parseGameSk,
  resolveNumMoves,
  shouldKeepCompletedGame,
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
  console.error(`Usage: npx tsx scripts/backfill-arena-completed-index.mjs --stage dev|prod [--metaGame <uid>] [--dry-run|--apply]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --metaGame <uid>   Only scan GAME rows for one meta-game
  --dry-run          Print planned indexes (default)
  --apply            Write COMPLETEDGAMES* rows and bump METAGAMES completedgames
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

async function scanFinishedArenaGames(docClient, tableName, metaGameFilter) {
  const items = [];
  let lastEvaluatedKey;

  const filterParts = [
    '#pk = :pk',
    '#pm = :arena',
    'attribute_exists(#ended)',
  ];
  const names = {
    '#pk': 'pk',
    '#pm': 'playMode',
    '#ended': 'gameEnded',
  };
  const values = {
    ':pk': 'GAME',
    ':arena': 'arena',
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
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/** Prefer completed sk (cbit 1) when both #0# and #1# rows exist for the same id. */
function dedupeGamesById(rawItems) {
  const byId = new Map();

  for (const raw of rawItems) {
    if (!raw?.id || !raw?.sk) {
      continue;
    }
    const parsed = parseGameSk(String(raw.sk));
    if (!parsed) {
      continue;
    }
    const existing = byId.get(raw.id);
    if (!existing) {
      byId.set(raw.id, raw);
      continue;
    }
    const existCbit = parseGameSk(String(existing.sk))?.cbit;
    const newCbit = parsed.cbit;
    if (newCbit === '1' && existCbit === '0') {
      byId.set(raw.id, raw);
    }
  }

  return [...byId.values()];
}

function toGameRecord(raw) {
  const game = hydrateGameState(raw);
  if (!game || typeof game !== 'object') {
    return null;
  }
  return game;
}

async function globalIndexExists(docClient, tableName, lastMoveTime, gameId) {
  const sk = completedGameIndexSk(Number(lastMoveTime), gameId);
  const result = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'COMPLETEDGAMES', sk },
    ProjectionExpression: 'pk',
  }));
  return Boolean(result.Item);
}

async function main() {
  const { stage, apply, metaGameFilter } = parseArgs(process.argv);
  const { profile, table } = STAGES[stage];

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: 'us-east-1',
    profile,
  }));

  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: backfill arena COMPLETEDGAMES on ${table}${metaGameFilter ? ` (meta ${metaGameFilter})` : ''}`,
  );

  const scanned = await scanFinishedArenaGames(docClient, table, metaGameFilter);
  const games = dedupeGamesById(scanned);

  let skippedNotArena = 0;
  let skippedShort = 0;
  let skippedIndexed = 0;
  let planned = 0;
  let applied = 0;
  const byMeta = new Map();

  for (const raw of games) {
    const game = toGameRecord(raw);
    if (!game || !isArenaGame(game)) {
      skippedNotArena += 1;
      continue;
    }
    if (game.gameEnded === undefined || game.lastMoveTime === undefined) {
      continue;
    }

    const numMoves = resolveNumMoves(game);
    if (!shouldKeepCompletedGame(game, numMoves)) {
      skippedShort += 1;
      console.log(
        `  skip short ${game.metaGame}#${game.id} (${numMoves} moves, need > ${game.numPlayers})`,
      );
      continue;
    }

    if (await globalIndexExists(docClient, table, game.lastMoveTime, game.id)) {
      skippedIndexed += 1;
      continue;
    }

    planned += 1;
    byMeta.set(game.metaGame, (byMeta.get(game.metaGame) ?? 0) + 1);
    const sk = completedGameIndexSk(game.lastMoveTime, game.id);
    console.log(`  index ${game.metaGame}#${game.id} sk=${sk} moves=${numMoves}`);

    if (apply) {
      await indexArenaCompletedGame(docClient, table, game);
      applied += 1;
    }
  }

  console.log('');
  console.log(`Scanned GAME rows: ${scanned.length} (${games.length} unique ids)`);
  console.log(`Planned index writes: ${planned}`);
  if (byMeta.size > 0) {
    console.log('By meta-game:');
    for (const [meta, count] of [...byMeta.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${meta}: +${count} completedgames (if apply)`);
    }
  }
  console.log(`Skipped (already indexed): ${skippedIndexed}`);
  console.log(`Skipped (too short): ${skippedShort}`);
  if (skippedNotArena) {
    console.log(`Skipped (not arena after hydrate): ${skippedNotArena}`);
  }
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
