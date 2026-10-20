import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { User } from '../api/types.js';
import { loadChallengeById } from './loadChallenge.js';
import {
  getChallengePosition,
} from './startPosition.js';

type ChallengeRecord = {
  id?: string;
  sk?: string;
  metaGame: string;
  variants?: string[];
  challenger: User;
  challengees?: User[];
  players?: User[];
  hasStartPosition?: boolean;
  standing?: boolean;
};

function isChallengeParticipant(
  userId: string,
  challenge: ChallengeRecord,
): boolean {
  if (challenge.challenger?.id === userId) {
    return true;
  }
  for (const challengee of challenge.challengees ?? []) {
    if (challengee.id === userId) {
      return true;
    }
  }
  for (const player of challenge.players ?? []) {
    if (player.id === userId) {
      return true;
    }
  }
  return false;
}

function canViewChallengePositionPreview(
  userId: string,
  challenge: ChallengeRecord,
  isStanding: boolean,
): boolean {
  if (challenge.hasStartPosition !== true) {
    return false;
  }
  if (isChallengeParticipant(userId, challenge)) {
    return true;
  }
  return isStanding;
}

export async function getChallengePositionPreviewAuth(
  userId: string,
  pars: { id?: string; metaGame?: string },
) {
  if (!pars?.id) {
    return formatReturnError('id is required.');
  }
  if (!pars.metaGame) {
    return formatReturnError('metaGame is required.');
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    const loaded = await loadChallengeById(
      ddbDocClient,
      tableName,
      pars.id,
      pars.metaGame,
    );
    if (loaded === undefined) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Challenge not found.' }),
        headers,
      };
    }
    const challenge = loaded.item as ChallengeRecord;
    const isStanding = loaded.isStanding;
    if (challenge.hasStartPosition !== true) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'This challenge does not include a start position.' }),
        headers,
      };
    }
    if (!canViewChallengePositionPreview(userId, challenge, isStanding)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Not allowed to view this challenge position.' }),
        headers,
      };
    }
    const position = await getChallengePosition(ddbDocClient, tableName, pars.id);
    if (position === undefined) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Start position not found for this challenge.' }),
        headers,
      };
    }
    const variants = position.variants ?? challenge.variants ?? [];
    return {
      statusCode: 200,
      body: JSON.stringify({
        metaGame: challenge.metaGame,
        variants,
        state: position.state,
      }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to load start position for challenge ${pars.id}`);
  }
}
