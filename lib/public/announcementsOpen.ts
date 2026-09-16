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

import {
  announcementsList,
  announcementGet,
  type AnnouncementsListPars,
  type AnnouncementGetPars,
} from '../announcements/index.js';

export async function announcementsListOpen(pars: AnnouncementsListPars) {
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementsList(ddbDocClient, tableName, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        items: result.data.items,
        nextCursor: result.data.nextCursor,
      }),
      headers: feedbackListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to list announcements.');
  }
}

export async function announcementGetOpen(pars: AnnouncementGetPars) {
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementGet(ddbDocClient, tableName, s3Client, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 404);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers: feedbackListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to load announcement.');
  }
}
