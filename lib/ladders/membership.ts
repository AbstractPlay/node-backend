import {
  DeleteCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import {
  computeLadderStatusAfterMemberChange,
  shouldSetEverActivated,
} from './lifecycle.js';
import { ladderByUserPk, ladderPlayerSk } from './keys.js';
import { getLadderPlayer, getLadderRecord } from './ladderStore.js';
import { resolveLadderJoinSeed } from './startingPoints.js';
import type { LadderPlayerRecord, LadderRecord } from './types.js';
import { revokePendingLadderChallengesForUser } from './challengeRevoke.js';
import { formatLadderDisplayName } from './displayName.js';
import {
  enqueueLadderJoinNotification,
  enqueueLadderLeaveNotification,
} from '../notifications.js';

const TABLE = () => process.env.ABSTRACT_PLAY_TABLE!;

function uniqueMemberIds(ids: string[], userid: string, add: boolean): string[] {
  const set = new Set(ids ?? []);
  if (add) {
    set.add(userid);
  } else {
    set.delete(userid);
  }
  return [...set];
}

export async function joinLadderMembership(
  ladderId: string,
  userid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return { ok: false, message: `Ladder ${ladderId} not found` };
  }

  const existing = await getLadderPlayer(ladderId, userid);
  const now = Date.now();

  if (existing !== undefined && existing.membershipStatus === 'active') {
    return { ok: false, message: 'You are already a member of this ladder' };
  }

  if (existing !== undefined && existing.membershipStatus === 'left') {
    await ddbDocClient.send(new PutCommand({
      TableName: TABLE(),
      Item: {
        pk: ladderByUserPk(userid),
        sk: ladderId,
        ladderId,
        userid,
      },
    }));
    await ddbDocClient.send(new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(ladderId, userid) },
      UpdateExpression: 'SET membershipStatus = :active',
      ExpressionAttributeValues: { ':active': 'active' },
    }));

    const wasInList = (ladder.activeMemberIds ?? []).includes(userid);
    const nextCount = wasInList ? ladder.activeMemberCount : ladder.activeMemberCount + 1;
    const nextIds = wasInList ? ladder.activeMemberIds : uniqueMemberIds(ladder.activeMemberIds ?? [], userid, true);
    await applyLadderMemberCountUpdate(ladder, nextCount, nextIds);
    await notifyLadderJoin(userid, ladder);
    return { ok: true };
  }

  const seed = await resolveLadderJoinSeed(
    ladder.metaGame,
    ladder.variants,
    userid,
    ladder.status,
  );

  const playerRow: LadderPlayerRecord = {
    pk: 'LADDERPLAYER',
    sk: ladderPlayerSk(ladderId, userid),
    ladderId,
    userid,
    points: seed.points,
    membershipStatus: 'active',
    joinedAt: now,
    lastLadderActivityAt: now,
    activeLadderGameCount: 0,
    startingPoints: seed.startingPoints,
    startingPointsSource: seed.startingPointsSource,
    startingRatingLabel: seed.startingRatingLabel,
    startingRatingLow: seed.startingRatingLow,
    startingPointsRecordedAt: seed.startingPointsRecordedAt,
    startingLadderStatus: seed.startingLadderStatus,
  };

  await ddbDocClient.send(new PutCommand({
    TableName: TABLE(),
    Item: playerRow,
  }));

  await ddbDocClient.send(new PutCommand({
    TableName: TABLE(),
    Item: {
      pk: ladderByUserPk(userid),
      sk: ladderId,
      ladderId,
      userid,
    },
  }));

  const nextCount = ladder.activeMemberCount + 1;
  const nextIds = uniqueMemberIds(ladder.activeMemberIds ?? [], userid, true);
  await applyLadderMemberCountUpdate(ladder, nextCount, nextIds);
  await notifyLadderJoin(userid, ladder);
  return { ok: true };
}

async function notifyLadderJoin(userid: string, ladder: LadderRecord): Promise<void> {
  try {
    await enqueueLadderJoinNotification(ddbDocClient, TABLE(), userid, {
      ladderId: ladder.id,
      metaGame: ladder.metaGame,
      variants: ladder.variants,
      displayName: formatLadderDisplayName(ladder.metaGame, ladder.variants),
    });
  } catch (err) {
    console.warn(`joinLadderMembership: ladder join notification failed for ${userid} on ${ladder.id}`, err);
  }
}

async function notifyLadderLeave(userid: string, ladder: LadderRecord): Promise<void> {
  try {
    await enqueueLadderLeaveNotification(ddbDocClient, TABLE(), userid, {
      ladderId: ladder.id,
      metaGame: ladder.metaGame,
      variants: ladder.variants,
      displayName: formatLadderDisplayName(ladder.metaGame, ladder.variants),
    });
  } catch (err) {
    console.warn(`leaveLadderMembership: ladder leave notification failed for ${userid} on ${ladder.id}`, err);
  }
}

async function applyLadderMemberCountUpdate(
  ladder: LadderRecord,
  activeMemberCount: number,
  activeMemberIds: string[],
): Promise<void> {
  const previousStatus = ladder.status;
  const nextStatus = computeLadderStatusAfterMemberChange({
    status: ladder.status,
    minActiveMembers: ladder.minActiveMembers,
    everActivated: ladder.everActivated,
    activeMemberCount,
  });
  const everActivated = shouldSetEverActivated(previousStatus, nextStatus, ladder.everActivated);
  await ddbDocClient.send(new UpdateCommand({
    TableName: TABLE(),
    Key: { pk: 'LADDER', sk: ladder.id },
    UpdateExpression: 'SET activeMemberCount = :c, activeMemberIds = :ids, #st = :st, everActivated = :ea',
    ExpressionAttributeNames: { '#st': 'status' },
    ExpressionAttributeValues: {
      ':c': activeMemberCount,
      ':ids': activeMemberIds,
      ':st': nextStatus,
      ':ea': everActivated,
    },
  }));
}

export async function leaveLadderMembership(
  ladderId: string,
  userid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const player = await getLadderPlayer(ladderId, userid);
  if (player === undefined || player.membershipStatus !== 'active') {
    return { ok: false, message: 'You are not an active member of this ladder' };
  }
  if ((player.activeLadderGameCount ?? 0) > 0) {
    return { ok: false, message: 'Leave this ladder only when you have no active ladder games' };
  }

  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return { ok: false, message: `Ladder ${ladderId} not found` };
  }

  await ddbDocClient.send(new UpdateCommand({
    TableName: TABLE(),
    Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(ladderId, userid) },
    UpdateExpression: 'SET membershipStatus = :left',
    ExpressionAttributeValues: { ':left': 'left' },
  }));

  await ddbDocClient.send(new DeleteCommand({
    TableName: TABLE(),
    Key: { pk: ladderByUserPk(userid), sk: ladderId },
  }));

  await ddbDocClient.send(new DeleteCommand({
    TableName: TABLE(),
    Key: { pk: 'LADDERPOOL', sk: `${ladderId}#${userid}` },
  }));

  await revokePendingLadderChallengesForUser(ddbDocClient, TABLE(), ladderId, userid);

  const nextCount = Math.max(0, ladder.activeMemberCount - 1);
  const nextIds = uniqueMemberIds(ladder.activeMemberIds ?? [], userid, false);
  await applyLadderMemberCountUpdate(ladder, nextCount, nextIds);
  await notifyLadderLeave(userid, ladder);
  return { ok: true };
}
