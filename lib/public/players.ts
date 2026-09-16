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
import { listHighlights, listMetaGameRecommendations } from '../playerGameMarks.js';
export async function playerHighlights(pars: { userId: string }) {
  if (!pars?.userId) {
    return formatReturnError('userId is required.');
  }
  try {
    const highlights = await listHighlights(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, pars.userId);
    return {
      statusCode: 200,
      body: JSON.stringify(highlights),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get highlights for ${pars.userId}`);
  }
}

export async function playerAbout(pars: { userId: string }) {
  if (!pars?.userId) {
    return formatReturnError('userId is required.');
  }
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const userData = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'USERS', sk: pars.userId },
      ProjectionExpression: 'about',
    }));
    const userAbout = userData.Item?.about;
    if (typeof userAbout === 'string' && userAbout.trim() !== '') {
      return {
        statusCode: 200,
        body: JSON.stringify({ about: userAbout }),
        headers,
      };
    }

    const botData = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'BOT', sk: pars.userId },
      ProjectionExpression: 'description',
    }));
    const botAbout = botData.Item?.description;
    if (typeof botAbout === 'string' && botAbout.trim() !== '') {
      return {
        statusCode: 200,
        body: JSON.stringify({ about: botAbout }),
        headers,
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({}),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get about text for ${pars.userId}`);
  }
}

export async function representativeGames(pars: { metaGame: string }) {
  if (!pars?.metaGame) {
    return formatReturnError('metaGame is required.');
  }
  try {
    const games = await listMetaGameRecommendations(ddbDocClient, process.env.ABSTRACT_PLAY_TABLE!, pars.metaGame);
    return {
      statusCode: 200,
      body: JSON.stringify(games),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get representative games for ${pars.metaGame}`);
  }
}
