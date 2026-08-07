#!/usr/bin/env node
/* eslint-env node */
/**
 * Backfill gameEnded on completed GAME records (pk=GAME, sk=<metaGame>#1#<gameId>)
 * when the field is missing.
 *
 * Resolution order:
 *   1. hydrate state + GameFactory, last stack _timestamp when engine.gameover
 *   2. COMPLETEDGAMES#<metaGame> sort key <timestamp>#<gameId>
 *   3. lastMoveTime on the GAME record
 *
 * Usage:
 *   node bin/backfill-game-ended.mjs [--stage dev|prod] [--dry-run] [--limit N]
 *
 * Requires AWS profile AbstractPlayDev or AbstractPlayProd (see serverless.yml).
 */
import { createRequire } from 'module';
import { gunzipSync } from 'zlib';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const require = createRequire(import.meta.url);
const { gameinfo, GameFactory } = require('@abstractplay/gameslib');

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

const COMPRESSED_PREFIX = 'gz:';

function usage() {
  console.error(`Usage: node bin/backfill-game-ended.mjs [options]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --dry-run          Report counts only; do not update
  --limit N          Stop after N updates (default: unlimited)
  --help, -h         Show this help
`);
  process.exit(1);
}

function parseArgs(argv) {
  let stage = 'dev';
  let dryRun = false;
  let limit;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      stage = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--limit' && argv[i + 1]) {
      limit = Number(argv[++i]);
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
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    console.error('--limit must be a positive number');
    usage();
  }

  return { stage, dryRun, limit };
}

function isGzipBuffer(buf) {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function decompressGameState(state) {
  if (!state || state.startsWith('{') || state.startsWith('[')) {
    return state;
  }
  if (state.startsWith(COMPRESSED_PREFIX)) {
    const base64 = state.slice(COMPRESSED_PREFIX.length);
    return gunzipSync(Buffer.from(base64, 'base64')).toString('utf8');
  }
  try {
    const buf = Buffer.from(state, 'base64');
    if (isGzipBuffer(buf)) {
      return gunzipSync(buf).toString('utf8');
    }
  } catch {
    // fall through
  }
  return state;
}

function hydrateGameState(record) {
  const decompressed = decompressGameState(record.state);
  if (decompressed === record.state) {
    return record;
  }
  return { ...record, state: decompressed };
}

function parseCompletedIndexSk(sk, gameId) {
  const suffix = `#${gameId}`;
  if (!sk.endsWith(suffix)) {
    return undefined;
  }
  const ts = sk.slice(0, -suffix.length);
  const parsed = Number(ts);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function queryCompletedGamesForMeta(docClient, tableName, metaGame) {
  const games = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': 'GAME',
        ':prefix': `${metaGame}#1#`,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      games.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return games;
}

async function lookupCompletedIndexTimestamp(docClient, tableName, metaGame, gameId, lastMoveTime) {
  if (lastMoveTime !== undefined) {
    const data = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk: `COMPLETEDGAMES#${metaGame}`,
        sk: `${lastMoveTime}#${gameId}`,
      },
      ProjectionExpression: '#sk',
      ExpressionAttributeNames: { '#sk': 'sk' },
    }));
    if (data.Item) {
      return lastMoveTime;
    }
  }

  let lastEvaluatedKey;
  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': `COMPLETEDGAMES#${metaGame}` },
      ProjectionExpression: '#sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      const ts = parseCompletedIndexSk(item.sk, gameId);
      if (ts !== undefined) {
        return ts;
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return undefined;
}

function resolveGameEndedFromEngine(game) {
  try {
    const hydrated = hydrateGameState(game);
    const engine = GameFactory(game.metaGame, hydrated.state);
    if (!engine?.gameover) {
      return undefined;
    }
    return new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
  } catch (err) {
    console.warn(`Engine resolution failed for ${game.id}:`, err.message ?? err);
    return undefined;
  }
}

async function resolveGameEnded(docClient, tableName, game) {
  const fromEngine = resolveGameEndedFromEngine(game);
  if (fromEngine !== undefined) {
    return { gameEnded: fromEngine, source: 'engine' };
  }

  const fromIndex = await lookupCompletedIndexTimestamp(
    docClient,
    tableName,
    game.metaGame,
    game.id,
    game.lastMoveTime,
  );
  if (fromIndex !== undefined) {
    return { gameEnded: fromIndex, source: 'completed-index' };
  }

  if (game.lastMoveTime !== undefined) {
    return { gameEnded: game.lastMoveTime, source: 'lastMoveTime' };
  }

  return undefined;
}

async function updateGameEnded(docClient, tableName, game, gameEnded, dryRun) {
  if (dryRun) {
    return true;
  }
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: game.sk },
    UpdateExpression: 'SET gameEnded = :ge',
    ConditionExpression: 'attribute_not_exists(gameEnded)',
    ExpressionAttributeValues: { ':ge': gameEnded },
  }));
  return true;
}

async function main() {
  const { stage, dryRun, limit } = parseArgs(process.argv);
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

  console.log(`Stage: ${stage}`);
  console.log(`Table: ${table}`);
  console.log(`Profile: ${profile}`);
  console.log(`Dry run: ${dryRun}`);
  if (limit !== undefined) {
    console.log(`Limit: ${limit}`);
  }

  const stats = {
    scanned: 0,
    alreadySet: 0,
    updated: 0,
    unresolved: 0,
    bySource: {},
  };

  const metaGames = [];
  gameinfo.forEach(g => metaGames.push(g.uid));

  for (const metaGame of metaGames) {
    const games = await queryCompletedGamesForMeta(docClient, table, metaGame);
    for (const game of games) {
      stats.scanned++;
      if (game.gameEnded !== undefined) {
        stats.alreadySet++;
        continue;
      }

      const resolved = await resolveGameEnded(docClient, table, game);
      if (!resolved) {
        stats.unresolved++;
        console.warn(`Unable to resolve gameEnded for ${game.metaGame}#1#${game.id}`);
        continue;
      }

      if (limit !== undefined && stats.updated >= limit) {
        console.log(`Reached --limit ${limit}`);
        printStats(stats, dryRun);
        return;
      }

      await updateGameEnded(docClient, table, game, resolved.gameEnded, dryRun);
      stats.updated++;
      stats.bySource[resolved.source] = (stats.bySource[resolved.source] ?? 0) + 1;
    }
  }

  printStats(stats, dryRun);
  console.log('\nDone.');
}

function printStats(stats, dryRun) {
  console.log('\nResults:');
  console.log(`  scanned: ${stats.scanned}`);
  console.log(`  alreadySet: ${stats.alreadySet}`);
  console.log(`  updated: ${stats.updated}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`  unresolved: ${stats.unresolved}`);
  if (Object.keys(stats.bySource).length > 0) {
    console.log('  bySource:');
    for (const [source, count] of Object.entries(stats.bySource).sort()) {
      console.log(`    ${source}: ${count}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
