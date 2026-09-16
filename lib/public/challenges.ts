import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { validateToken } from '@sunknudsen/totp';
import { ddbDocClient } from '../ddb.js';
import { sesClient, s3Client } from '../api/clients.js';
import {
  headers,
  cachedListHeaders,
  feedbackListHeaders,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import type { User, UsersData } from '../api/types.js';

import { queryAllStandingChallenges } from '../allStandingChallenges.js';
import { getPlayerRelationIds } from '../playerRelations.js';

type FullChallenge = {
  challenger?: { id: string };
};

export async function challengeDetails(pars: { id: string; }) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "CHALLENGE", "sk": pars.id
        },
      }));
    console.log("Got:");
    console.log(data);
    return {
      statusCode: 200,
      body: JSON.stringify(data.Item),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get challenge ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

export async function standingChallenges(pars: { metaGame: string; userId?: string }) {
  const game = pars.metaGame;
  console.log(game);

  const blockedByPromise = pars.userId
    ? getPlayerRelationIds(pars.userId, "BLOCKEDBY#")
    : Promise.resolve([] as string[]);

  try {
    const [challengesData, blockedBy] = await Promise.all([
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
          ExpressionAttributeNames: { "#pk": "pk" }
        })),
      blockedByPromise,
    ]);

    let items = challengesData.Items || [];
    if (blockedBy.length > 0) {
      const blockedBySet = new Set(blockedBy);
      items = items.filter((c) => {
        const challengerId = (c as FullChallenge).challenger?.id;
        return challengerId === undefined || !blockedBySet.has(challengerId);
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify(items),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get standing challenges for ${pars.metaGame}`);
  }
}

export async function allStandingChallenges(userId?: string) {
  const blockedByPromise = userId
    ? getPlayerRelationIds(userId, "BLOCKEDBY#")
    : Promise.resolve([] as string[]);

  try {
    const blockedBy = await blockedByPromise;
    const items = await queryAllStandingChallenges(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      blockedBy,
    );
    return {
      statusCode: 200,
      body: JSON.stringify(items),
      headers: cachedListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError('Unable to get all standing challenges');
  }
}
