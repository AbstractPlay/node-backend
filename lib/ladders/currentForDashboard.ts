import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { formatLadderDisplayName } from './displayName.js';
import {
  assertLadderMatchmakingOpen,
  assertNotOnVacation,
  assertUnderLadderConcurrentCap,
} from './eligibility.js';
import { getLadderPlayer, getLadderRecord, queryLadderPlayers } from './ladderStore.js';
import { getLadderPoolStatus } from './pool.js';
import { rankLadderMembers } from './rank.js';
import { ladderByUserPk } from './keys.js';
import type { LadderPlayerRecord, LadderRecord } from './types.js';

export type DashboardLadderMembership = {
  ladderId: string;
  displayName: string;
  metaGame: string;
  variants: string[];
  points: number;
  rank: number;
  activeLadderGameCount: number;
  ladderStatus: LadderRecord['status'];
  viewerInPool: boolean;
  poolJoinEligible: boolean;
};

async function listLadderIdsForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': ladderByUserPk(userId) },
      ExclusiveStartKey: lastKey,
    }));
    for (const row of result.Items ?? []) {
      const ladderId = String(row.ladderId ?? row.sk ?? '');
      if (ladderId.length > 0) {
        ids.push(ladderId);
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

export async function resolveLadderMembershipsForDashboard(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now = Date.now(),
): Promise<DashboardLadderMembership[]> {
  const ladderIds = await listLadderIdsForUser(client, tableName, userId);
  if (ladderIds.length === 0) {
    return [];
  }
  const memberships: DashboardLadderMembership[] = [];
  for (const ladderId of ladderIds) {
    const [ladder, player] = await Promise.all([
      getLadderRecord(ladderId),
      getLadderPlayer(ladderId, userId),
    ]);
    if (ladder === undefined || player === undefined || player.membershipStatus !== 'active') {
      continue;
    }
    const allPlayers = await queryLadderPlayers(ladderId);
    const ranks = rankLadderMembers(allPlayers);
    const poolStatus = await getLadderPoolStatus(client, tableName, ladderId, userId);
    const poolJoinEligible = await computePoolJoinEligible(
      client,
      tableName,
      ladder,
      player,
      userId,
      poolStatus.viewerInPool,
      now,
    );
    memberships.push({
      ladderId,
      displayName: formatLadderDisplayName(ladder.metaGame, ladder.variants),
      metaGame: ladder.metaGame,
      variants: [...ladder.variants],
      points: player.points,
      rank: ranks.get(userId) ?? 0,
      activeLadderGameCount: player.activeLadderGameCount ?? 0,
      ladderStatus: ladder.status,
      viewerInPool: poolStatus.viewerInPool,
      poolJoinEligible,
    });
  }
  return memberships;
}

async function computePoolJoinEligible(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladder: LadderRecord,
  player: LadderPlayerRecord,
  userId: string,
  viewerInPool: boolean,
  now: number,
): Promise<boolean> {
  if (viewerInPool) {
    return false;
  }
  if (assertLadderMatchmakingOpen(ladder) !== null) {
    return false;
  }
  if (assertUnderLadderConcurrentCap(player, ladder.tuning, 'caller') !== null) {
    return false;
  }
  if (await assertNotOnVacation(client, tableName, userId, now, 'caller') !== null) {
    return false;
  }
  return true;
}

export function filterCurrentLadderGames<T extends { ladderId?: string }>(games: T[]): T[] {
  return games.filter(g => g.ladderId !== undefined && g.ladderId !== '');
}
