import { PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError, handleCommonErrors } from '../api/http.js';

type StandingChallenge = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  limit: number;
  sensitivity: 'meta' | 'variants';
  suspended: boolean;
};

type StandingChallengeRec = {
  pk: 'REALSTANDING';
  sk: string;
  standing: StandingChallenge[];
};

export async function block_player(blockingPlayerId: string, pars: { playerId: string }) {
  const blockedPlayerId = pars.playerId;
  if (blockingPlayerId === blockedPlayerId) {
    return formatReturnError("Cannot block yourself");
  }
  try {
    await Promise.all([
      ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          pk: `PLAYER#${blockingPlayerId}`,
          sk: `BLOCKED#${blockedPlayerId}`,
        },
      })),
      ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          pk: `PLAYER#${blockedPlayerId}`,
          sk: `BLOCKEDBY#${blockingPlayerId}`,
        },
      })),
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully blocked player" }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to block player ${blockedPlayerId}`);
  }
}

export async function unblock_player(blockingPlayerId: string, pars: { playerId: string }) {
  const blockedPlayerId = pars.playerId;
  try {
    await Promise.all([
      ddbDocClient.send(new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: `PLAYER#${blockingPlayerId}`,
          sk: `BLOCKED#${blockedPlayerId}`,
        },
      })),
      ddbDocClient.send(new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: `PLAYER#${blockedPlayerId}`,
          sk: `BLOCKEDBY#${blockingPlayerId}`,
        },
      })),
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Successfully unblocked player" }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to unblock player ${blockedPlayerId}`);
  }
}

export async function setPublicRivalries(userid: string, pars: { state: boolean }) {
  try {
    console.log(`Setting 'publicRivalries' to ${pars.state} for user ${userid}`);
    const update = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      ExpressionAttributeNames: { "#pr": "publicRivalries" },
      ExpressionAttributeValues: { ":pr": pars.state },
      UpdateExpression: "set #pr = :pr",
    };
    await Promise.all([
      ddbDocClient.send(
        new UpdateCommand({
          ...update,
          Key: { "pk": "USER", "sk": userid },
        })
      ),
      ddbDocClient.send(
        new UpdateCommand({
          ...update,
          Key: { "pk": "USERS", "sk": userid },
        })
      ),
    ]);
  } catch (error) {
    logGetItemError(error);
    throw new Error("setPublicRivalries: Failed to save public rivalries preference");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved public rivalries preference for ${userid}`,
    }),
    headers
  };
}

export async function updateStanding(userid: string, pars: { entries: StandingChallenge[] }) {
  try {
    // simply replace the existing record
    const Item: StandingChallengeRec = {
      pk: "REALSTANDING",
      sk: userid,
      standing: pars.entries,
    };
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item,
      })
    );
    console.log(`Returning ${JSON.stringify(Item)}`);
    return {
      statusCode: 200,
      body: JSON.stringify(Item),
      headers
    };
  }
  catch (error) {
    handleCommonErrors(error as { code: any; message: any });
    return formatReturnError(`Unable to update standing challenges for ${userid}: ${error}`);
  }
}
