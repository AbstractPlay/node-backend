import { BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isBotId } from '../participants.js';
import { isVacationStintLive } from '../vacation/resolve.js';
import type { VacationUserFields } from '../vacation/types.js';
import { ladderPoolPairBlocked } from './blocks.js';
import {
  getLadderPairLastPlayedAt,
  getOpenLadderGameCountBetween,
  isWithinRematchCooldown,
} from './pairHistory.js';
import { isPointsWithinReach } from './reach.js';
import { rankLadderMembers } from './rank.js';
import type { LadderPlayerRecord, LadderRecord, LadderTuning } from './types.js';

export type LadderEligibilityReject =
  | 'ladder_not_found'
  | 'ladder_not_active'
  | 'not_active_member'
  | 'opponent_not_active_member'
  | 'caller_at_cap'
  | 'opponent_at_cap'
  | 'out_of_reach'
  | 'nearest_anyway_invalid'
  | 'outgoing_challenge_exists'
  | 'on_vacation'
  | 'opponent_on_vacation'
  | 'rematch_cooldown'
  | 'open_ladder_game_between_players'
  | 'blocked'
  | 'opponent_is_bot'
  | 'alone_on_ladder';

export function assertLadderMatchmakingOpen(ladder: LadderRecord): LadderEligibilityReject | null {
  if (ladder.status !== 'active') {
    return 'ladder_not_active';
  }
  return null;
}

export function assertActiveLadderMember(
  player: LadderPlayerRecord | undefined,
): LadderEligibilityReject | null {
  if (player === undefined || player.membershipStatus !== 'active') {
    return 'not_active_member';
  }
  return null;
}

export function assertUnderLadderConcurrentCap(
  player: LadderPlayerRecord,
  tuning: LadderTuning,
  which: 'caller' | 'opponent',
): LadderEligibilityReject | null {
  const count = player.activeLadderGameCount ?? 0;
  if (count >= tuning.maxConcurrentLadderGames) {
    return which === 'caller' ? 'caller_at_cap' : 'opponent_at_cap';
  }
  return null;
}

export async function loadUserVacationFields(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<VacationUserFields | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'vacationStartsAt, vacationStintStartedAt, vacationEndsAt, vacationOpenEnded, vacationPauseMsUsed, vacationQuotaYear',
  }));
  return data.Item as VacationUserFields | undefined;
}

export async function assertNotOnVacation(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now: number,
  which: 'caller' | 'opponent',
): Promise<LadderEligibilityReject | null> {
  const fields = await loadUserVacationFields(client, tableName, userId);
  if (fields !== undefined && isVacationStintLive(fields, now)) {
    return which === 'caller' ? 'on_vacation' : 'opponent_on_vacation';
  }
  return null;
}

export async function assertRematchAllowed(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
  tuning: LadderTuning,
  now: number,
): Promise<LadderEligibilityReject | null> {
  const last = await getLadderPairLastPlayedAt(client, tableName, ladderId, userA, userB);
  if (isWithinRematchCooldown(last, tuning.rematchCooldownDays, now)) {
    return 'rematch_cooldown';
  }
  return null;
}

export type OpponentEligibilityContext = {
  client: DynamoDBDocumentClient;
  tableName: string;
  ladder: LadderRecord;
  caller: LadderPlayerRecord;
  opponent: LadderPlayerRecord;
  now: number;
  requireReach: boolean;
  checkBlocks: boolean;
};

export async function opponentPassesLadderGuards(
  ctx: OpponentEligibilityContext,
): Promise<LadderEligibilityReject | null> {
  const { ladder, caller, opponent, tuning } = {
    ...ctx,
    tuning: ctx.ladder.tuning,
  };
  if (opponent.userid === caller.userid) {
    return 'alone_on_ladder';
  }
  const oppMember = assertActiveLadderMember(opponent);
  if (oppMember !== null) {
    return 'opponent_not_active_member';
  }
  if (await isBotId(opponent.userid)) {
    return 'opponent_is_bot';
  }
  const oppCap = assertUnderLadderConcurrentCap(opponent, tuning, 'opponent');
  if (oppCap !== null) {
    return oppCap;
  }
  const oppVac = await assertNotOnVacation(ctx.client, ctx.tableName, opponent.userid, ctx.now, 'opponent');
  if (oppVac !== null) {
    return oppVac;
  }
  if (ctx.requireReach && !isPointsWithinReach(caller.points, opponent.points, tuning.challengeReachPercent)) {
    return 'out_of_reach';
  }
  const openBetween = await getOpenLadderGameCountBetween(
    ctx.client,
    ctx.tableName,
    ladder.id,
    caller.userid,
    opponent.userid,
  );
  if (openBetween > 0) {
    return 'open_ladder_game_between_players';
  }
  const rematch = await assertRematchAllowed(
    ctx.client,
    ctx.tableName,
    ladder.id,
    caller.userid,
    opponent.userid,
    tuning,
    ctx.now,
  );
  if (rematch !== null) {
    return rematch;
  }
  if (ctx.checkBlocks) {
    const blocked = await ladderPoolPairBlocked(
      ctx.client,
      ctx.tableName,
      caller.userid,
      opponent.userid,
    );
    if (blocked) {
      return 'blocked';
    }
  }
  return null;
}

export function eligibilityMessage(reason: LadderEligibilityReject): string {
  switch (reason) {
    case 'ladder_not_found':
      return 'Ladder not found';
    case 'ladder_not_active':
      return 'This ladder is not accepting matchmaking right now';
    case 'not_active_member':
      return 'You are not an active member of this ladder';
    case 'opponent_not_active_member':
      return 'Opponent is not an active ladder member';
    case 'caller_at_cap':
      return 'You have the maximum number of active ladder games';
    case 'opponent_at_cap':
      return 'Opponent has the maximum number of active ladder games';
    case 'out_of_reach':
      return 'Opponent is outside your challenge reach band';
    case 'nearest_anyway_invalid':
      return 'Nearest-player challenge is not available right now';
    case 'outgoing_challenge_exists':
      return 'You already have a pending ladder challenge on this ladder';
    case 'on_vacation':
      return 'Matchmaking is unavailable while you are on vacation';
    case 'opponent_on_vacation':
      return 'Opponent is on vacation';
    case 'rematch_cooldown':
      return 'Rematch cooldown has not elapsed for this opponent';
    case 'open_ladder_game_between_players':
      return 'You already have an in-progress ladder game with this opponent';
    case 'blocked':
      return 'Cannot pair with this opponent in the pool';
    case 'opponent_is_bot':
      return 'Bots cannot join ladder matchmaking';
    case 'alone_on_ladder':
      return 'No eligible opponents on this ladder';
    default:
      return 'Not eligible for ladder matchmaking';
  }
}

export type LadderOpponentCandidate = {
  userid: string;
  points: number;
  rank: number;
};

export async function countEligibleOpponents(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladder: LadderRecord,
  caller: LadderPlayerRecord,
  activeMembers: LadderPlayerRecord[],
  options: { requireReach: boolean; checkBlocks: boolean; now: number },
): Promise<number> {
  let count = 0;
  for (const opponent of activeMembers) {
    if (opponent.userid === caller.userid) {
      continue;
    }
    const reject = await opponentPassesLadderGuards({
      client,
      tableName,
      ladder,
      caller,
      opponent,
      now: options.now,
      requireReach: options.requireReach,
      checkBlocks: options.checkBlocks,
    });
    if (reject === null) {
      count += 1;
    }
  }
  return count;
}

export async function findNearestAnywayCandidate(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladder: LadderRecord,
  caller: LadderPlayerRecord,
  activeMembers: LadderPlayerRecord[],
  now: number,
): Promise<LadderOpponentCandidate | undefined> {
  const ranks = rankLadderMembers(activeMembers);
  const callerRank = ranks.get(caller.userid) ?? 9999;
  let best: { opponent: LadderPlayerRecord; pointsDist: number; rankDist: number } | undefined;
  for (const opponent of activeMembers) {
    const reject = await opponentPassesLadderGuards({
      client,
      tableName,
      ladder,
      caller,
      opponent,
      now,
      requireReach: false,
      checkBlocks: false,
    });
    if (reject !== null) {
      continue;
    }
    const pointsDist = Math.abs(opponent.points - caller.points);
    const oppRank = ranks.get(opponent.userid) ?? 9999;
    const rankDist = Math.abs(oppRank - callerRank);
    if (
      best === undefined
      || pointsDist < best.pointsDist
      || (pointsDist === best.pointsDist && rankDist < best.rankDist)
      || (pointsDist === best.pointsDist && rankDist === best.rankDist && opponent.userid < best.opponent.userid)
    ) {
      best = { opponent, pointsDist, rankDist };
    }
  }
  if (best === undefined) {
    return undefined;
  }
  return {
    userid: best.opponent.userid,
    points: best.opponent.points,
    rank: ranks.get(best.opponent.userid) ?? 0,
  };
}

export async function hasOutgoingLadderChallenge(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  ladderId: string,
): Promise<boolean> {
  const user = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'challenges_issued',
  }));
  const issued = user.Item?.challenges_issued as Set<string> | string[] | undefined;
  const ids: string[] = issued instanceof Set ? [...issued] : Array.isArray(issued) ? issued : [];
  if (ids.length === 0) {
    return false;
  }
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(id => ({ pk: 'CHALLENGE', sk: id })),
          ProjectionExpression: 'ladderId, challengees, challenger',
        },
      },
    }));
    for (const item of data.Responses?.[tableName] ?? []) {
      const row = item as { ladderId?: string; challengees?: { id: string }[]; challenger?: { id: string } };
      if (row.ladderId !== ladderId) {
        continue;
      }
      if (row.challenger?.id === userId) {
        return true;
      }
    }
  }
  return false;
}
