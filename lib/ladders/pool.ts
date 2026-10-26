import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getParticipants } from '../participants.js';
import {
  assertActiveLadderMember,
  assertLadderMatchmakingOpen,
  assertNotOnVacation,
  assertUnderLadderConcurrentCap,
  opponentPassesLadderGuards,
} from './eligibility.js';
import { createLadderGame, dequeueLadderPool } from './createLadderGame.js';
import { getLadderPlayer, getLadderRecord, queryLadderPlayers } from './ladderStore.js';
import { rankLadderMembers } from './rank.js';
import type { LadderPlayerRecord } from './types.js';

export type PoolJoinResult =
  | { ok: true; queued: true }
  | { ok: true; queued: false; gameId: string }
  | { ok: false; message: string };

function poolSk(ladderId: string, userid: string): string {
  return `${ladderId}#${userid}`;
}

export async function leaveLadderPool(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userid: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'LADDERPOOL', sk: poolSk(ladderId, userid) },
  }));
}

async function listPoolWaiters(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
): Promise<string[]> {
  const items: string[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'LADDERPOOL', ':sk': `${ladderId}#` },
      ExclusiveStartKey: lastKey,
    }));
    for (const row of result.Items ?? []) {
      const sk = String(row.sk ?? '');
      const suffix = sk.slice(ladderId.length + 1);
      if (suffix.length > 0) {
        items.push(suffix);
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function getLadderPoolStatus(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  viewerUserId?: string,
): Promise<{ poolWaiterCount: number; viewerInPool: boolean }> {
  const waiterIds = await listPoolWaiters(client, tableName, ladderId);
  return {
    poolWaiterCount: waiterIds.length,
    viewerInPool:
      viewerUserId !== undefined && viewerUserId !== ''
      && waiterIds.includes(viewerUserId),
  };
}

async function pickPoolOpponent(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  caller: LadderPlayerRecord,
  waiterIds: string[],
  membersById: Map<string, LadderPlayerRecord>,
  ranks: Map<string, number>,
  now: number,
): Promise<string | undefined> {
  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return undefined;
  }
  const callerRank = ranks.get(caller.userid) ?? 9999;
  let best: { userid: string; rankDist: number } | undefined;
  for (const waiterId of waiterIds) {
    if (waiterId === caller.userid) {
      continue;
    }
    const opponent = membersById.get(waiterId);
    if (opponent === undefined) {
      continue;
    }
    const reject = await opponentPassesLadderGuards({
      client,
      tableName,
      ladder,
      caller,
      opponent,
      now,
      requireReach: true,
      checkBlocks: true,
    });
    if (reject !== null) {
      continue;
    }
    const oppRank = ranks.get(waiterId) ?? 9999;
    const rankDist = Math.abs(oppRank - callerRank);
    if (
      best === undefined
      || rankDist < best.rankDist
      || (rankDist === best.rankDist && waiterId < best.userid)
    ) {
      best = { userid: waiterId, rankDist };
    }
  }
  return best?.userid;
}

export async function joinLadderPool(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userid: string,
  now = Date.now(),
): Promise<PoolJoinResult> {
  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return { ok: false, message: 'Ladder not found' };
  }
  const open = assertLadderMatchmakingOpen(ladder);
  if (open !== null) {
    return { ok: false, message: 'This ladder is not accepting matchmaking right now' };
  }
  const caller = await getLadderPlayer(ladderId, userid);
  const memberErr = assertActiveLadderMember(caller);
  if (memberErr !== null || caller === undefined) {
    return { ok: false, message: 'You are not an active member of this ladder' };
  }
  const capErr = assertUnderLadderConcurrentCap(caller, ladder.tuning, 'caller');
  if (capErr !== null) {
    return { ok: false, message: 'You have the maximum number of active ladder games' };
  }
  const vacErr = await assertNotOnVacation(client, tableName, userid, now, 'caller');
  if (vacErr !== null) {
    return { ok: false, message: 'Matchmaking is unavailable while you are on vacation' };
  }

  const members = await queryLadderPlayers(ladderId);
  const active = members.filter(m => m.membershipStatus === 'active');
  const membersById = new Map(active.map(m => [m.userid, m]));
  const ranks = rankLadderMembers(active);
  const waiterIds = await listPoolWaiters(client, tableName, ladderId);
  const opponentId = await pickPoolOpponent(
    client,
    tableName,
    ladderId,
    caller,
    waiterIds,
    membersById,
    ranks,
    now,
  );

  if (opponentId !== undefined) {
    const opponent = membersById.get(opponentId)!;
    try {
      const participants = await getParticipants([userid, opponentId]);
      const p0 = participants.find(p => p.id === userid)!;
      const p1 = participants.find(p => p.id === opponentId)!;
      const { gameId } = await createLadderGame({
        client,
        tableName,
        ladderId,
        players: [
          { id: p0.id, name: p0.name, time: 0 },
          { id: p1.id, name: p1.name, time: 0 },
        ],
        now,
      });
      await dequeueLadderPool(client, tableName, ladderId, [userid, opponentId]);
      return { ok: true, queued: false, gameId };
    } catch {
      await client.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: 'LADDERPOOL',
          sk: poolSk(ladderId, userid),
          ladderId,
          userid,
          joinedAt: now,
        },
      }));
      return { ok: true, queued: true };
    }
  }

  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: 'LADDERPOOL',
      sk: poolSk(ladderId, userid),
      ladderId,
      userid,
      joinedAt: now,
    },
  }));
  return { ok: true, queued: true };
}
