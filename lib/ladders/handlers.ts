import { headers, formatReturnError } from '../api/http.js';
import type { LambdaHttpResponse } from '../api/http.js';
import { formatLadderDisplayName } from './displayName.js';
import {
  buildLadderBoard,
  buildLadderViewer,
  getLadderRecord,
  ladderToListItem,
  listAllLadders,
  queryLadderPlayers,
} from './ladderStore.js';
import { joinLadderMembership, leaveLadderMembership } from './membership.js';
import { createLadder } from './newLadder.js';
import { issueLadderChallenge, respondLadderChallenge } from './ladderChallenge.js';
import { joinLadderPool, leaveLadderPool } from './pool.js';
import { getLadderCommentsItem, submitLadderComment } from './ladderComments.js';
import {
  countEligibleOpponents,
  findNearestAnywayCandidate,
} from './eligibility.js';
import { isPointsWithinReach, challengeReachBounds } from './reach.js';
import { ddbDocClient } from '../ddb.js';

function jsonOk(body: unknown): LambdaHttpResponse {
  return {
    statusCode: 200,
    body: JSON.stringify(body),
    headers,
  };
}

function clientError(status: number, body: Record<string, unknown>): LambdaHttpResponse {
  return {
    statusCode: status,
    body: JSON.stringify(body),
    headers,
  };
}

export async function handleNewLadder(
  userid: string,
  pars: { metaGame?: string; variants?: string[] },
): Promise<LambdaHttpResponse> {
  if (pars.metaGame === undefined || pars.variants === undefined) {
    return formatReturnError('metaGame and variants are required');
  }
  const result = await createLadder(userid, pars.metaGame, pars.variants);
  if (!result.ok) {
    if (result.existingLadderId !== undefined) {
      return clientError(409, {
        message: result.message,
        existingLadderId: result.existingLadderId,
        seriesKey: result.seriesKey,
        displayName: formatLadderDisplayName(pars.metaGame, pars.variants),
      });
    }
    return formatReturnError(result.message);
  }
  return jsonOk({
    message: 'Ladder created',
    ladderId: result.ladderId,
    displayName: result.displayName,
  });
}

export async function handleJoinLadder(
  userid: string,
  pars: { ladderId?: string },
): Promise<LambdaHttpResponse> {
  if (pars.ladderId === undefined) {
    return formatReturnError('ladderId is required');
  }
  const result = await joinLadderMembership(pars.ladderId, userid);
  if (!result.ok) {
    return formatReturnError(result.message);
  }
  return jsonOk({ message: 'Joined ladder', ladderId: pars.ladderId });
}

export async function handleLeaveLadder(
  userid: string,
  pars: { ladderId?: string },
): Promise<LambdaHttpResponse> {
  if (pars.ladderId === undefined) {
    return formatReturnError('ladderId is required');
  }
  const result = await leaveLadderMembership(pars.ladderId, userid);
  if (!result.ok) {
    return formatReturnError(result.message);
  }
  return jsonOk({ message: 'Left ladder', ladderId: pars.ladderId });
}

export async function handleGetLadder(
  pars: { ladderId?: string },
  viewerUserId?: string,
): Promise<LambdaHttpResponse> {
  if (pars.ladderId === undefined) {
    return formatReturnError('ladderId is required');
  }
  const ladder = await getLadderRecord(pars.ladderId);
  if (ladder === undefined) {
    return formatReturnError(`Ladder ${pars.ladderId} not found`);
  }
  const players = await queryLadderPlayers(pars.ladderId);
  const board = buildLadderBoard(players);
  const viewer = buildLadderViewer(players, viewerUserId);
  const comments = await getLadderCommentsItem(pars.ladderId);
  const now = Date.now();
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const activeMembers = players.filter(p => p.membershipStatus === 'active');
  const viewerRow = viewerUserId
    ? players.find(p => p.userid === viewerUserId)
    : undefined;
  let matchmaking: Record<string, unknown> = {};
  if (viewerRow !== undefined && viewerRow.membershipStatus === 'active') {
    const reach = challengeReachBounds(viewerRow.points, ladder.tuning.challengeReachPercent);
    const inReachOpponentCount = await countEligibleOpponents(
      ddbDocClient,
      tableName,
      ladder,
      viewerRow,
      activeMembers,
      { requireReach: true, checkBlocks: false, now },
    );
    const nearestAnywayCandidate = inReachOpponentCount === 0
      ? await findNearestAnywayCandidate(
        ddbDocClient,
        tableName,
        ladder,
        viewerRow,
        activeMembers,
        now,
      )
      : undefined;
    matchmaking = {
      challengeReach: reach,
      inReachOpponentCount,
      nearestAnywayCandidate,
    };
  }
  const boardWithReach = board.map((row) => {
    if (viewerRow === undefined || viewerUserId === row.userid) {
      return row;
    }
    return {
      ...row,
      withinReach: isPointsWithinReach(
        viewerRow.points,
        row.points,
        ladder.tuning.challengeReachPercent,
      ),
    };
  });
  return jsonOk({
    ladder: {
      ladderId: ladder.id,
      displayName: formatLadderDisplayName(ladder.metaGame, ladder.variants),
      metaGame: ladder.metaGame,
      variants: ladder.variants,
      status: ladder.status,
      activeMemberCount: ladder.activeMemberCount,
      minActiveMembers: ladder.minActiveMembers,
      everActivated: ladder.everActivated,
    },
    board: boardWithReach,
    viewer,
    comments,
    matchmaking,
  });
}

export async function handleGetLadders(
  pars: { metaGame?: string; status?: string },
): Promise<LambdaHttpResponse> {
  let ladders = await listAllLadders();
  if (pars.metaGame !== undefined && pars.metaGame !== '') {
    ladders = ladders.filter((l) => l.metaGame === pars.metaGame);
  }
  if (pars.status !== undefined && pars.status !== '') {
    ladders = ladders.filter((l) => l.status === pars.status);
  }
  return jsonOk({
    ladders: ladders.map(ladderToListItem),
  });
}

export async function handleJoinLadderPool(
  userid: string,
  pars: { ladderId?: string },
): Promise<LambdaHttpResponse> {
  if (pars.ladderId === undefined) {
    return formatReturnError('ladderId is required');
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const result = await joinLadderPool(ddbDocClient, tableName, pars.ladderId, userid);
  if (!result.ok) {
    return formatReturnError(result.message);
  }
  if (result.queued) {
    return jsonOk({ message: 'Waiting in ladder pool', ladderId: pars.ladderId, queued: true });
  }
  return jsonOk({
    message: 'Ladder game started',
    ladderId: pars.ladderId,
    queued: false,
    gameId: result.gameId,
  });
}

export async function handleLeaveLadderPool(
  userid: string,
  pars: { ladderId?: string },
): Promise<LambdaHttpResponse> {
  if (pars.ladderId === undefined) {
    return formatReturnError('ladderId is required');
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  await leaveLadderPool(ddbDocClient, tableName, pars.ladderId, userid);
  return jsonOk({ message: 'Left ladder pool', ladderId: pars.ladderId });
}

export async function handleNewLadderChallenge(
  userid: string,
  pars: {
    ladderId?: string;
    opponentId?: string;
    nearestAnyway?: boolean;
    comment?: string;
  },
): Promise<LambdaHttpResponse> {
  if (pars.ladderId === undefined) {
    return formatReturnError('ladderId is required');
  }
  return issueLadderChallenge(userid, {
    ladderId: pars.ladderId,
    opponentId: pars.opponentId,
    nearestAnyway: pars.nearestAnyway,
    comment: pars.comment,
  });
}

export async function handleRespondLadderChallenge(
  userid: string,
  pars: {
    id?: string;
    metaGame?: string;
    response?: boolean;
    comment?: string;
  },
): Promise<LambdaHttpResponse> {
  if (pars.id === undefined || pars.metaGame === undefined || pars.response === undefined) {
    return formatReturnError('id, metaGame, and response are required');
  }
  return respondLadderChallenge(userid, {
    id: pars.id,
    metaGame: pars.metaGame,
    response: pars.response,
    comment: pars.comment,
  });
}

export async function handleSubmitLadderComment(
  userid: string,
  pars: { ladderId?: string; comment?: string },
): Promise<LambdaHttpResponse> {
  return submitLadderComment(userid, pars);
}
