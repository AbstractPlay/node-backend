#!/usr/bin/env npx tsx
/**
 * Recompute ladder join seeds from _summary-ratings (Glicko ratingLow) and fix
 * LADDERPLAYER rows that were seeded with wrong game keys (display name vs meta UID).
 *
 *   npm run backfill-ladder-join-seeds -- --stage dev --dry-run
 *   npm run backfill-ladder-join-seeds -- --stage dev --live --ladderId <uuid>
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { resolveLadderJoinSeed } from '../lib/ladders/startingPoints.js';
import { getLadderRecord } from '../lib/ladders/ladderStore.js';
import type { LadderPlayerRecord } from '../lib/ladders/types.js';

function tableNameForStage(stage: string): string {
  if (stage === 'prod') {
    return process.env.ABSTRACT_PLAY_TABLE_PROD ?? 'abstract-play-prod';
  }
  return process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
}

function parseArgs(argv: string[]) {
  const args = { stage: 'dev', live: false, ladderId: undefined as string | undefined };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage' && argv[i + 1]) {
      args.stage = argv[++i]!;
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--dry-run') {
      args.live = false;
    } else if (arg === '--ladderId' && argv[i + 1]) {
      args.ladderId = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.error(`Usage: npm run backfill-ladder-join-seeds -- --stage dev|prod [--dry-run|--live] [--ladderId <uuid>]

Default is dry-run. Override table with ABSTRACT_PLAY_TABLE / ABSTRACT_PLAY_TABLE_PROD.
`);
      process.exit(0);
    }
  }
  return args;
}

async function queryLadderPlayers(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<LadderPlayerRecord[]> {
  const items: LadderPlayerRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': 'LADDERPLAYER' },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items as LadderPlayerRecord[] ?? []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function seedFieldsDiffer(
  row: LadderPlayerRecord,
  expected: Awaited<ReturnType<typeof resolveLadderJoinSeed>>,
): boolean {
  if (row.startingPointsSource !== expected.startingPointsSource) {
    return true;
  }
  if (Math.abs(row.startingPoints - expected.startingPoints) > 0.001) {
    return true;
  }
  if (expected.startingRatingLabel !== undefined
    && row.startingRatingLabel !== expected.startingRatingLabel) {
    return true;
  }
  if (expected.startingRatingLow !== undefined
    && row.startingRatingLow !== expected.startingRatingLow) {
    return true;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const tableName = tableNameForStage(args.stage);
  process.env.ABSTRACT_PLAY_TABLE = tableName;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const dryRun = !args.live;

  console.log(`Table: ${tableName}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'live'}`);
  if (args.ladderId) {
    console.log(`Ladder filter: ${args.ladderId}`);
  }

  const players = await queryLadderPlayers(client, tableName);
  const ladderCache = new Map<string, Awaited<ReturnType<typeof getLadderRecord>>>();
  let examined = 0;
  let corrected = 0;

  for (const row of players) {
    if (args.ladderId !== undefined && row.ladderId !== args.ladderId) {
      continue;
    }
    examined += 1;
    let ladder = ladderCache.get(row.ladderId);
    if (ladder === undefined) {
      ladder = await getLadderRecord(row.ladderId);
      ladderCache.set(row.ladderId, ladder);
    }
    if (ladder === undefined) {
      console.warn(`Skip ${row.userid}: ladder ${row.ladderId} not found`);
      continue;
    }

    const expected = await resolveLadderJoinSeed(
      ladder.metaGame,
      ladder.variants,
      row.userid,
      ladder.status,
    );
    if (!seedFieldsDiffer(row, expected)) {
      continue;
    }

    const atSeed = Math.abs(row.points - row.startingPoints) < 0.001;
    const nextPoints = atSeed ? expected.points : row.points;

    corrected += 1;
    console.log(JSON.stringify({
      ladderId: row.ladderId,
      userid: row.userid,
      was: {
        points: row.points,
        startingPoints: row.startingPoints,
        startingPointsSource: row.startingPointsSource,
        startingRatingLabel: row.startingRatingLabel,
      },
      next: {
        points: nextPoints,
        startingPoints: expected.startingPoints,
        startingPointsSource: expected.startingPointsSource,
        startingRatingLabel: expected.startingRatingLabel,
        startingRatingLow: expected.startingRatingLow,
      },
      pointsAdjusted: atSeed && nextPoints !== row.points,
    }));

    if (!dryRun) {
      const values: Record<string, unknown> = {
        ':sp': expected.startingPoints,
        ':src': expected.startingPointsSource,
        ':at': expected.startingPointsRecordedAt,
        ':st': expected.startingLadderStatus,
        ':pts': nextPoints,
      };
      let update = 'SET startingPoints = :sp, startingPointsSource = :src, startingPointsRecordedAt = :at, startingLadderStatus = :st, points = :pts';
      const remove: string[] = [];
      if (expected.startingRatingLabel !== undefined) {
        update += ', startingRatingLabel = :lbl';
        values[':lbl'] = expected.startingRatingLabel;
      } else {
        remove.push('startingRatingLabel');
      }
      if (expected.startingRatingLow !== undefined) {
        update += ', startingRatingLow = :low';
        values[':low'] = expected.startingRatingLow;
      } else {
        remove.push('startingRatingLow');
      }
      if (remove.length > 0) {
        update += ` REMOVE ${remove.join(', ')}`;
      }
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'LADDERPLAYER', sk: row.sk },
        UpdateExpression: update,
        ExpressionAttributeValues: values,
      }));
    }
  }

  console.log(JSON.stringify({
    examined,
    corrected,
    dryRun,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
