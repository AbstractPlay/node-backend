#!/usr/bin/env node
/**
 * Backfill LADDERBYUSER# index rows from active LADDERPLAYER memberships.
 *
 * Usage:
 *   npm run backfill-ladder-by-user -- --stage dev
 *   npm run backfill-ladder-by-user -- --stage prod --live
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
      console.error(`Usage: npm run backfill-ladder-by-user -- --stage dev|prod [--live]

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

async function queryAll(client, tableName, pk) {
  const items = [];
  let lastKey;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  const dryRun = !args.live;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  console.log(`Table: ${tableName}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);

  const players = await queryAll(client, tableName, 'LADDERPLAYER');
  const active = players.filter((row) => row.membershipStatus === 'active');

  let puts = 0;
  for (const row of active) {
    const ladderId = row.ladderId;
    const userid = row.userid;
    if (typeof ladderId !== 'string' || typeof userid !== 'string') {
      continue;
    }
    puts += 1;
    if (!dryRun) {
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `LADDERBYUSER#${userid}`,
          sk: ladderId,
          ladderId,
          userid,
        },
      }));
    }
  }

  console.log('Summary:');
  console.log(`  LADDERPLAYER rows: ${players.length}`);
  console.log(`  active memberships: ${active.length}`);
  console.log(`  index puts ${dryRun ? 'would apply' : 'applied'}: ${puts}`);
  if (dryRun && puts > 0) {
    console.log('Re-run with --live to write rows.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
