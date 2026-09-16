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

export async function eventGetEvent(pars: { eventid: string }) {
  try {
    const event = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "ORGEVENT",
          "sk": pars.eventid
        },
      }));
    if (event.Item === undefined) {
      return {
        statusCode: 404,
        headers,
      };
    }

    const players = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      }));
    const games = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "ORGEVENTGAME", ":sk": pars.eventid },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      }));

    return {
      statusCode: 200,
      body: JSON.stringify({ event: event.Item, players: players.Items, games: games.Items }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get organized event ${pars.eventid}. Error: ${error}`);
  }
}

export async function eventGetEvents() {
  try {
    const work: Promise<any>[] = [];
    work.push(ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "ORGEVENT" },
        ExpressionAttributeNames: { "#pk": "pk" },
      })));
    work.push(ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER" },
        ExpressionAttributeNames: { "#pk": "pk" },
      })));
    work.push(ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "ORGEVENTGAME" },
        ExpressionAttributeNames: { "#pk": "pk" },
      })));
    const data = await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify({ events: data[0].Items, players: data[1].Items, games: data[2].Items }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get organized events. Error: ${error}`);
  }
}
