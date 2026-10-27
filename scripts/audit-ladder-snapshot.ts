#!/usr/bin/env npx tsx
/**
 * Read-only ladder health snapshot (DynamoDB).
 * Usage: ABSTRACT_PLAY_TABLE=abstract-play-dev npx tsx scripts/audit-ladder-snapshot.ts <ladderId>
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildOpenLadderGameCounts } from '../lib/ladders/reconcileActiveCounts.js';
import type { LadderRecord } from '../lib/ladders/types.js';
import { queryAllItems } from '../lib/ladders/dynamoPages.js';

const REGION = 'us-east-1';
const ladderId = process.argv[2];
if (!ladderId) {
  console.error('Usage: audit-ladder-snapshot.ts <ladderId>');
  process.exit(1);
}

async function main() {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    console.error('ABSTRACT_PLAY_TABLE is required');
    process.exit(1);
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const ladderRow = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND #sk = :sk',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': 'LADDER', ':sk': ladderId },
  }));
  const ladder = ladderRow.Items?.[0] as LadderRecord | undefined;

  const players = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': 'LADDERPLAYER', ':sk': `${ladderId}#` },
  });

  const ladderGames = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': 'LADDERGAME', ':sk': `${ladderId}#` },
  });

  const pool = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': 'LADDERPOOL', ':sk': `${ladderId}#` },
  });

  const ladderMap = new Map<string, LadderRecord>();
  if (ladder) {
    ladderMap.set(ladder.sk, ladder);
  }
  const { counts: expectedOpen, openRows } = await buildOpenLadderGameCounts(client, tableName, ladderMap);

  const drift: { userid: string; stored: number; expected: number }[] = [];
  for (const row of players) {
    const userid = String(row.userid ?? '');
    const key = `${ladderId}#${userid}`;
    const expected = expectedOpen.get(key) ?? 0;
    const stored = Number(row.activeLadderGameCount ?? 0);
    if (stored !== expected) {
      drift.push({ userid, stored, expected });
    }
  }

  const unsettled = ladderGames.filter(g => g.settled !== true);
  const settled = ladderGames.filter(g => g.settled === true);

  console.log(JSON.stringify({
    tableName,
    ladderId,
    ladder: ladder
      ? {
        status: ladder.status,
        metaGame: ladder.metaGame,
        variants: ladder.variants,
        activeMemberCount: ladder.activeMemberCount,
      }
      : null,
    members: players.map(p => ({
      userid: p.userid,
      membershipStatus: p.membershipStatus,
      points: p.points,
      activeLadderGameCount: p.activeLadderGameCount,
      lastLadderActivityAt: p.lastLadderActivityAt,
    })),
    ladderGameLinks: {
      total: ladderGames.length,
      unsettled: unsettled.length,
      settled: settled.length,
      unsettledGameIds: unsettled.map(g => g.gameId),
    },
    openLadderGameRowsScanned: openRows,
    poolWaiters: pool.map(p => p.sk),
    activeCountDrift: drift,
    zeroDrift: drift.length === 0,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
