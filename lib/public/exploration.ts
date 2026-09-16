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

export async function getPublicExploration(pars: { game: string }) {
  let data;
  try {
    data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "PUBLICEXPLORATION#" + pars.game },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get public exploration data for game ${pars.game}`);
  }
  if (data.Items === undefined) {
    return;
  }
  console.log("Got public exploration data", data.Items);
  const trees = data.Items.map((d: any) => { return { move: d.sk, version: d.version, tree: d.tree } });
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}
