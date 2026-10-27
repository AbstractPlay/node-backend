#!/usr/bin/env node
/**
 * Reconcile TOURNAMENTBYUSER# index rows — delete stale entries.
 *
 * Scans index partitions (pk begins_with TOURNAMENTBYUSER#). Deletes a row when:
 * - TOURNAMENT record is missing
 * - tournament has dateEnded
 * - tournament is not started
 * - TOURNAMENTPLAYER row for user+division is missing (when index has division)
 *
 * Usage:
 *   npm run reconcile-tournament-by-user -- --stage dev
 *   npm run reconcile-tournament-by-user -- --stage dev --live
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const INDEX_PREFIX = 'TOURNAMENTBYUSER#';

function tableNameForStage(stage) {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

function parseArgs(argv) {
  const args = { stage: 'dev', live: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i];
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--dry-run') {
      args.live = false;
    } else if (arg === '--help' || arg === '-h') {
      console.error(`Usage: npm run reconcile-tournament-by-user -- --stage dev|prod [--live]

Default is dry-run. Pass --live to delete stale index rows.
`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function userIdFromIndexPk(pk) {
  return String(pk).slice(INDEX_PREFIX.length);
}

async function scanIndexRows(client, tableName) {
  const items = [];
  let lastKey;
  do {
    const page = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'begins_with(#pk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':prefix': INDEX_PREFIX },
      ProjectionExpression: '#pk, #sk, division',
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function getTournament(client, tableName, tournamentId) {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENT', sk: tournamentId },
  }));
  return data.Item;
}

async function getTournamentPlayer(client, tableName, sk) {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENTPLAYER', sk },
  }));
  return data.Item;
}

async function hasAssignedPlayerRow(client, tableName, tournamentId, userId) {
  const prefix = `${tournamentId}#`;
  let lastKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk and begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': 'TOURNAMENTPLAYER',
        ':sk': prefix,
      },
      ExclusiveStartKey: lastKey,
    }));
    for (const row of result.Items ?? []) {
      if (row.playerid === userId && row.division !== undefined && row.division !== null) {
        return true;
      }
      const parts = String(row.sk).split('#');
      if (parts.length >= 3 && parts[2] === userId && row.division !== undefined) {
        return true;
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const dryRun = !args.live;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(`Table: ${tableName}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);

  const indexRows = await scanIndexRows(client, tableName);
  const stats = {
    kept: 0,
    deleted: 0,
    missingTournament: 0,
    ended: 0,
    notStarted: 0,
    playerGone: 0,
  };

  for (const row of indexRows) {
    const pk = String(row.pk);
    const tournamentId = String(row.sk);
    const userId = userIdFromIndexPk(pk);
    const tournament = await getTournament(client, tableName, tournamentId);

    let reason;
    if (tournament === undefined) {
      reason = 'missingTournament';
      stats.missingTournament += 1;
    } else if (tournament.dateEnded !== undefined && tournament.dateEnded !== null) {
      reason = 'ended';
      stats.ended += 1;
    } else if (tournament.started !== true) {
      reason = 'notStarted';
      stats.notStarted += 1;
    } else if (row.division !== undefined && row.division !== null) {
      const playerSk = `${tournamentId}#${row.division}#${userId}`;
      const playerRow = await getTournamentPlayer(client, tableName, playerSk);
      if (playerRow === undefined) {
        reason = 'playerGone';
        stats.playerGone += 1;
      }
    } else {
      const assigned = await hasAssignedPlayerRow(client, tableName, tournamentId, userId);
      if (!assigned) {
        reason = 'playerGone';
        stats.playerGone += 1;
      }
    }

    if (reason === undefined) {
      stats.kept += 1;
      continue;
    }

    stats.deleted += 1;
    console.log(`delete ${pk} / ${tournamentId} (${userId}): ${reason}`);
    if (!dryRun) {
      await client.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk, sk: tournamentId },
      }));
    }
  }

  console.log('Summary:');
  console.log(`  index rows scanned: ${indexRows.length}`);
  console.log(`  kept: ${stats.kept}`);
  console.log(`  ${dryRun ? 'would delete' : 'deleted'}: ${stats.deleted}`);
  if (stats.deleted > 0) {
    console.log(`    missing tournament: ${stats.missingTournament}`);
    console.log(`    ended: ${stats.ended}`);
    console.log(`    not started: ${stats.notStarted}`);
    console.log(`    player row gone: ${stats.playerGone}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
