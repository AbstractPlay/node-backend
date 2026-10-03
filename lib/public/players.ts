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
import { finalizeVacationIfNeeded } from '../vacation/persist.js';
import { vacationFieldsFromUserItem, VACATION_USER_PROJECTION } from '../vacation/load.js';
import {
  buildPlayerAboutVacation,
  syncUsersDirectoryOnVacation,
} from '../vacation/publicMirror.js';
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
    const now = Date.now();
    let aboutText: string | undefined;

    const userData = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'USERS', sk: pars.userId },
      ProjectionExpression: 'about',
    }));
    const userAbout = userData.Item?.about;
    if (typeof userAbout === 'string' && userAbout.trim() !== '') {
      aboutText = userAbout;
    }

    if (aboutText === undefined) {
      const botData = await ddbDocClient.send(new GetCommand({
        TableName: tableName,
        Key: { pk: 'BOT', sk: pars.userId },
        ProjectionExpression: 'description',
      }));
      const botAbout = botData.Item?.description;
      if (typeof botAbout === 'string' && botAbout.trim() !== '') {
        aboutText = botAbout;
      }
    }

    let vacation: ReturnType<typeof buildPlayerAboutVacation>;
    const userVacation = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: pars.userId },
        ProjectionExpression: VACATION_USER_PROJECTION,
      }),
    );
    if (userVacation.Item) {
      await finalizeVacationIfNeeded(ddbDocClient, tableName, pars.userId, now);
      const refreshed = await ddbDocClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: 'USER', sk: pars.userId },
          ProjectionExpression: VACATION_USER_PROJECTION,
        }),
      );
      const fields = refreshed.Item
        ? vacationFieldsFromUserItem(refreshed.Item as Record<string, unknown>)
        : vacationFieldsFromUserItem(userVacation.Item as Record<string, unknown>);
      vacation = buildPlayerAboutVacation(fields, now);
      await syncUsersDirectoryOnVacation(ddbDocClient, tableName, pars.userId, fields, now);
    }

    const body: { about?: string; vacation?: NonNullable<typeof vacation> } = {};
    if (aboutText !== undefined) {
      body.about = aboutText;
    }
    if (vacation !== undefined) {
      body.vacation = vacation;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(body),
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
