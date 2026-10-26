#!/usr/bin/env node
/* eslint-env node */
/**
 * One-time cleanup: remove duplicate COMPLETEDGAMES* index rows that share the
 * same game id but different sort keys (lastMoveTime#id).
 *
 * Not every duplicate breaks the completed-games API: only groups where more than
 * one row has commented=1 caused BatchGet "duplicate keys" (Storisende). Others
 * (e.g. Zola) still return HTTP 200 but may list the same game id multiple times.
 *
 * Keeps the row whose sk matches the canonical GAME#1# record lastMoveTime when
 * present; otherwise keeps the newest sk (lexicographic max).
 *
 * Usage:
 *   npx tsx scripts/dedupe-completed-game-indexes.mjs --stage dev --dry-run
 *   npx tsx scripts/dedupe-completed-game-indexes.mjs --stage prod --apply
 *   npx tsx scripts/dedupe-completed-game-indexes.mjs --stage prod --metaGame storisende --apply
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import { adjustShardedCounts, completedGameIndexSk } from '../lib/gameProjector.ts';

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
  console.error(`Usage: npx tsx scripts/dedupe-completed-game-indexes.mjs --stage dev|prod [--metaGame <uid>] [--dry-run|--apply]

Options:
  --stage dev|prod   AWS profile + DynamoDB table (default: dev)
  --metaGame <uid>   Only scan one meta game partition (default: all playable metas)
  --dry-run          Print planned deletes (default)
  --apply            Delete orphan rows and adjust METAGAMES completedgames counts
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

async function queryPartition(docClient, tableName, pk) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const page = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function resolveCanonicalSk(docClient, tableName, metaGame, gameId, rows) {
  const game = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: {
      pk: 'GAME',
      sk: `${metaGame}#1#${gameId}`,
    },
    ProjectionExpression: 'lastMoveTime',
  }));

  if (game.Item?.lastMoveTime !== undefined) {
    return completedGameIndexSk(Number(game.Item.lastMoveTime), gameId);
  }

  return rows.map((row) => row.sk).sort().at(-1);
}

function deleteKeysForRow(metaGame, row) {
  const sk = row.sk;
  const keys = [
    { pk: 'COMPLETEDGAMES', sk },
    { pk: `COMPLETEDGAMES#${metaGame}`, sk },
  ];
  for (const player of row.players ?? []) {
    if (player?.id) {
      keys.push({ pk: `COMPLETEDGAMES#${player.id}`, sk });
    }
  }
  return keys;
}

async function batchDelete(docClient, tableName, keys) {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((key) => ({
          DeleteRequest: { Key: key },
        })),
      },
    }));
  }
}

function sanitizeCommentedCount(rows) {
  return rows.filter((row) => (row.commented ?? 0) === 1).length;
}

function listMetaGames(metaGameFilter) {
  if (metaGameFilter) {
    return [metaGameFilter];
  }
  const metas = [];
  gameinfo.forEach((g) => metas.push(g.uid));
  return metas;
}

async function findDuplicatesForMeta(docClient, tableName, metaGame) {
  const pk = `COMPLETEDGAMES#${metaGame}`;
  const rows = await queryPartition(docClient, tableName, pk);
  const byId = new Map();

  for (const row of rows) {
    if (!row.id || !row.sk) {
      continue;
    }
    const group = byId.get(row.id) ?? [];
    group.push(row);
    byId.set(row.id, group);
  }

  const plans = [];
  for (const [gameId, group] of byId) {
    if (group.length < 2) {
      continue;
    }
    const canonicalSk = await resolveCanonicalSk(docClient, tableName, metaGame, gameId, group);
    const orphans = group.filter((row) => row.sk !== canonicalSk);
    if (orphans.length === 0) {
      console.warn(
        `[${metaGame}] duplicate ids for ${gameId} but no orphan sk (canonical=${canonicalSk}); rows=${group.map((r) => r.sk).join(', ')}`,
      );
      continue;
    }
    const commentedOneCount = sanitizeCommentedCount(group);
    plans.push({
      metaGame,
      gameId,
      canonicalSk,
      orphans,
      commentedOneCount,
      rowCount: group.length,
    });
  }

  return plans;
}

async function main() {
  const { stage, apply, metaGameFilter } = parseArgs(process.argv);
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
  if (metaGameFilter) {
    console.log(`Meta filter: ${metaGameFilter}`);
  }

  const metaGames = listMetaGames(metaGameFilter);
  const allPlans = [];
  for (const metaGame of metaGames) {
    const plans = await findDuplicatesForMeta(docClient, table, metaGame);
    allPlans.push(...plans);
  }

  if (allPlans.length === 0) {
    console.log('No duplicate completed index rows found.');
    return;
  }

  let totalOrphans = 0;
  let breakingGroups = 0;
  const countAdjust = new Map();

  for (const plan of allPlans) {
    totalOrphans += plan.orphans.length;
    if (plan.commentedOneCount > 1) {
      breakingGroups += 1;
    }
    countAdjust.set(
      plan.metaGame,
      (countAdjust.get(plan.metaGame) ?? 0) + plan.orphans.length,
    );
    const apiNote = plan.commentedOneCount > 1
      ? 'API-breaking (multiple commented=1)'
      : plan.commentedOneCount === 1
        ? 'list duplication only (single commented=1)'
        : 'list duplication only (no commented=1)';
    console.log(
      `[${plan.metaGame}] ${plan.gameId} (${plan.rowCount} rows, ${apiNote}): keep ${plan.canonicalSk}, delete ${plan.orphans.map((o) => o.sk).join(', ')}`,
    );
    for (const orphan of plan.orphans) {
      const keys = deleteKeysForRow(plan.metaGame, orphan);
      if (!apply) {
        for (const key of keys) {
          console.log(`  would delete ${key.pk} ${key.sk}`);
        }
        continue;
      }
      await batchDelete(docClient, table, keys);
    }
  }

  console.log(`Total orphan rows (per meta partition): ${totalOrphans}`);
  console.log(
    `Groups that would have broken games API sanitize (commented=1 on >1 row): ${breakingGroups}`,
  );

  if (apply) {
    for (const [metaGame, delta] of countAdjust) {
      if (delta <= 0) {
        continue;
      }
      await adjustShardedCounts(docClient, table, metaGame, { completedgames: -delta });
      console.log(`Adjusted METAGAMES#${metaGame} completedgames by -${delta}`);
    }
    console.log('Done.');
  } else {
    console.log('Dry run complete. Re-run with --apply to delete and fix counts.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
