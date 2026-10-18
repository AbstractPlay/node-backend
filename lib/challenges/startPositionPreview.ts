import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { User } from '../api/types.js';
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

export async function getChallengePositionPreviewAuth(
  userId: string,
  pars: { id?: string },
) {
  if (!pars?.id) {
    return formatReturnError('id is required.');
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    const challengeData = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: 'CHALLENGE', sk: pars.id },
      }),
    );
    const challenge = challengeData.Item as ChallengeRecord | undefined;
    if (challenge === undefined) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Challenge not found.' }),
        headers,
      };
    }
    if (!isChallengeParticipant(userId, challenge)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Not allowed to view this challenge position.' }),
        headers,
      };
    }
    if (challenge.hasStartPosition !== true) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'This challenge does not include a start position.' }),
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
