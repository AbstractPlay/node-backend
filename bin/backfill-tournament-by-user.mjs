#!/usr/bin/env node
/**
 * Backfill TOURNAMENTBYUSER# index rows for in-progress tournaments.
 *
 * For each TOURNAMENT with started && !dateEnded, reads TOURNAMENTPLAYER rows
 * with division set and idempotently Put's the per-user index item.
 *
 * Usage:
 *   npm run backfill-tournament-by-user -- --stage dev
 *   npm run backfill-tournament-by-user -- --stage dev --live
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { putCurrentTournamentForUser } from '../lib/tournaments/byUserIndex.ts';

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
      console.error(`Usage: npm run backfill-tournament-by-user -- --stage dev|prod [--live]

Default is dry-run (counts only). Pass --live to write index rows.
`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

async function queryAll(client, tableName, pk, skPrefix) {
  const items = [];
  let lastKey;
  const values = { ':pk': pk };
  let condition = '#pk = :pk';
  const names = { '#pk': 'pk' };
  if (skPrefix !== undefined) {
    values[':sk'] = skPrefix;
    names['#sk'] = 'sk';
    condition += ' and begins_with(#sk, :sk)';
  }
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: condition,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function tournamentIdFromRecord(item) {
  return String(item.id ?? item.sk ?? '');
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const dryRun = !args.live;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(`Table: ${tableName}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);

  const tournaments = await queryAll(client, tableName, 'TOURNAMENT');
  const active = tournaments.filter(
    t => t.started === true && (t.dateEnded === undefined || t.dateEnded === null),
  );

  let tournamentsScanned = 0;
  let playersEligible = 0;
  let puts = 0;

  for (const tournament of active) {
    const tournamentId = tournamentIdFromRecord(tournament);
    if (tournamentId === '') {
      continue;
    }
    tournamentsScanned += 1;
    const players = await queryAll(client, tableName, 'TOURNAMENTPLAYER', `${tournamentId}#`);
    for (const row of players) {
      if (row.division === undefined || row.division === null) {
        continue;
      }
      const userId = row.playerid;
      if (typeof userId !== 'string' || userId.length === 0) {
        continue;
      }
      playersEligible += 1;
      puts += 1;
      if (!dryRun) {
        await putCurrentTournamentForUser(client, tableName, {
          userId,
          tournamentId,
          division: Number(row.division),
          metaGame: typeof tournament.metaGame === 'string' ? tournament.metaGame : undefined,
        });
      }
    }
  }

  console.log('Summary:');
  console.log(`  active tournaments (started, not ended): ${active.length}`);
  console.log(`  tournaments scanned: ${tournamentsScanned}`);
  console.log(`  players with division: ${playersEligible}`);
  console.log(`  index puts ${dryRun ? 'would apply' : 'applied'}: ${puts}`);
  if (dryRun && puts > 0) {
    console.log('Re-run with --live to write rows.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
