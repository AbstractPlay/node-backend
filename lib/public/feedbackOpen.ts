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
  feedbackList,
  feedbackGet,
  feedbackHistoryList,
  feedbackWishlistSearch,
  type FeedbackListPars,
  type FeedbackGetPars,
  type FeedbackHistoryListPars,
  type FeedbackWishlistSearchPars,
} from '../feedback/index.js';
import { attachWishlistCoverImageUrls } from '../feedback/attachments.js';

export async function feedbackListOpen(pars: FeedbackListPars) {
  try {
    const result = await feedbackList(ddbDocClient, process.env.FEEDBACK_TABLE, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    const items = pars.kind === 'wishlist' && result.data.items.length > 0
      ? await attachWishlistCoverImageUrls(s3Client, result.data.items)
      : result.data.items;
    return {
      statusCode: 200,
      body: JSON.stringify({ items, nextCursor: result.data.nextCursor }),
      headers: feedbackListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to list feedback items.');
  }
}

export async function feedbackGetOpen(pars: FeedbackGetPars) {
  try {
    const result = await feedbackGet(ddbDocClient, process.env.FEEDBACK_TABLE, s3Client, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers: feedbackListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to load feedback item.');
  }
}

export async function feedbackHistoryListOpen(pars: FeedbackHistoryListPars) {
  try {
    const result = await feedbackHistoryList(ddbDocClient, process.env.FEEDBACK_TABLE, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers: feedbackListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to list feedback history.');
  }
}

export async function feedbackWishlistSearchOpen(pars: FeedbackWishlistSearchPars) {
  try {
    const result = await feedbackWishlistSearch(ddbDocClient, process.env.FEEDBACK_TABLE, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers: feedbackListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to search wishlist.');
  }
}
