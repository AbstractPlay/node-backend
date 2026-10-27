import { newChallenge, respondedChallenge } from '../challenges/authHandlers.js';
import { formatReturnError } from '../api/http.js';
import type { LambdaHttpResponse } from '../api/http.js';
import type { User } from '../api/types.js';
import {
  AUTOMATED_TOURNAMENT_CLOCK_INC,
  AUTOMATED_TOURNAMENT_CLOCK_MAX,
} from '../tournaments/clock.js';
import { ddbDocClient } from '../ddb.js';
import { dequeueLadderPool } from './createLadderGame.js';
import {
  assertActiveLadderMember,
  assertLadderMatchmakingOpen,
  assertNotOnVacation,
  assertUnderLadderConcurrentCap,
  countEligibleOpponents,
  eligibilityMessage,
  findNearestAnywayCandidate,
  hasOutgoingLadderChallenge,
  opponentPassesLadderGuards,
} from './eligibility.js';
import { getLadderPlayer, getLadderRecord, queryLadderPlayers } from './ladderStore.js';
import { getParticipants } from '../participants.js';
import { isBlankDisplayName } from '../userDisplayName.js';

const TABLE = () => process.env.ABSTRACT_PLAY_TABLE!;

export async function issueLadderChallenge(
  userid: string,
  pars: {
    ladderId: string;
    opponentId?: string;
    nearestAnyway?: boolean;
    comment?: string;
  },
): Promise<LambdaHttpResponse> {
  const ladderId = pars.ladderId;
  const now = Date.now();
  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return errorResponse(eligibilityMessage('ladder_not_found'));
  }
  const open = assertLadderMatchmakingOpen(ladder);
  if (open !== null) {
    return errorResponse(eligibilityMessage(open));
  }
  const caller = await getLadderPlayer(ladderId, userid);
  const memberErr = assertActiveLadderMember(caller);
  if (memberErr !== null || caller === undefined) {
    return errorResponse(eligibilityMessage(memberErr ?? 'not_active_member'));
  }
  const capErr = assertUnderLadderConcurrentCap(caller, ladder.tuning, 'caller');
  if (capErr !== null) {
    return errorResponse(eligibilityMessage(capErr));
  }
  const vacErr = await assertNotOnVacation(ddbDocClient, TABLE(), userid, now, 'caller');
  if (vacErr !== null) {
    return errorResponse(eligibilityMessage(vacErr));
  }
  if (await hasOutgoingLadderChallenge(ddbDocClient, TABLE(), userid, ladderId)) {
    return errorResponse(eligibilityMessage('outgoing_challenge_exists'));
  }

  const members = await queryLadderPlayers(ladderId);
  const active = members.filter(m => m.membershipStatus === 'active');
  let opponentId = pars.opponentId;
  let reachOverride: 'nearest_anyway' | undefined;

  if (pars.nearestAnyway === true) {
    const inReach = await countEligibleOpponents(
      ddbDocClient,
      TABLE(),
      ladder,
      caller,
      active,
      { requireReach: true, checkBlocks: false, now },
    );
    const any = await countEligibleOpponents(
      ddbDocClient,
      TABLE(),
      ladder,
      caller,
      active,
      { requireReach: false, checkBlocks: false, now },
    );
    if (inReach > 0 || any < 1) {
      return errorResponse(eligibilityMessage('nearest_anyway_invalid'));
    }
    const nearest = await findNearestAnywayCandidate(
      ddbDocClient,
      TABLE(),
      ladder,
      caller,
      active,
      now,
    );
    if (nearest === undefined) {
      return errorResponse(eligibilityMessage('alone_on_ladder'));
    }
    opponentId = nearest.userid;
    reachOverride = 'nearest_anyway';
  }

  if (opponentId === undefined || opponentId === '') {
    return errorResponse('opponentId is required');
  }
  const opponent = await getLadderPlayer(ladderId, opponentId);
  if (opponent === undefined) {
    return errorResponse(eligibilityMessage('opponent_not_active_member'));
  }
  const guard = await opponentPassesLadderGuards({
    client: ddbDocClient,
    tableName: TABLE(),
    ladder,
    caller,
    opponent,
    now,
    requireReach: reachOverride === undefined,
    checkBlocks: false,
  });
  if (guard !== null) {
    return errorResponse(eligibilityMessage(guard));
  }

  const parts = await getParticipants([userid, opponentId]);
  const challenger = parts.find(p => p.id === userid);
  const challengee = parts.find(p => p.id === opponentId);
  if (!challenger || !challengee) {
    return errorResponse('Opponent not found');
  }
  if (isBlankDisplayName(challengee.name)) {
    return errorResponse('Opponent has not completed registration.');
  }

  const challengerUser: User = { id: challenger.id, name: challenger.name };
  const challengeeUser: User = { id: challengee.id, name: challengee.name };

  const response = await newChallenge(userid, {
    metaGame: ladder.metaGame,
    numPlayers: 2,
    seating: 'random',
    variants: [...ladder.variants],
    challenger: challengerUser,
    challengees: [challengeeUser],
    clockStart: AUTOMATED_TOURNAMENT_CLOCK_MAX,
    clockInc: AUTOMATED_TOURNAMENT_CLOCK_INC,
    clockMax: AUTOMATED_TOURNAMENT_CLOCK_MAX,
    clockHard: true,
    rated: true,
    noExplore: false,
    teachingMode: false,
    comment: pars.comment ?? '',
    ladderId,
    ...(reachOverride ? { reachOverride } : {}),
  }, { source: 'ladder' });

  await dequeueLadderPool(ddbDocClient, TABLE(), ladderId, [userid]);
  return response;
}

export async function respondLadderChallenge(
  userid: string,
  pars: { id: string; metaGame: string; response: boolean; comment?: string },
): Promise<LambdaHttpResponse> {
  return respondedChallenge(userid, {
    id: pars.id,
    metaGame: pars.metaGame,
    response: pars.response,
    standing: false,
    comment: pars.comment ?? '',
  });
}

function errorResponse(message: string): LambdaHttpResponse {
  return formatReturnError(message);
}
