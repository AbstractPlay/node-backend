import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import {
  dismissAllNotifications,
  dismissNotification as deleteUserNotification,
  loadNotificationsForDashboard,
  markNotificationsSeen,
} from '../notifications.js';

export async function dismissNotificationAuth(userid: string, pars: { sk?: string }) {
  if (!pars.sk) {
    return formatReturnError('sk is required');
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    const deleted = await deleteUserNotification(ddbDocClient, tableName, userid, pars.sk);
    if (!deleted) {
      return formatReturnError('Notification not found');
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to dismiss notification for ${userid}`);
  }
}

export async function dismissAllNotificationsAuth(userid: string) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    await dismissAllNotifications(ddbDocClient, tableName, userid);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, notifications: [] }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to dismiss all notifications for ${userid}`);
  }
}

export async function listNotificationsAuth(userid: string) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    const notifications = await loadNotificationsForDashboard(
      ddbDocClient,
      tableName,
      userid,
      { refreshExpiry: false },
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ notifications }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to list notifications for ${userid}`);
  }
}

export async function markNotificationsSeenAuth(userid: string, pars: { sks?: string[] }) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  try {
    const notifications = await markNotificationsSeen(
      ddbDocClient,
      tableName,
      userid,
      { sks: pars.sks },
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ notifications }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to mark notifications seen for ${userid}`);
  }
}
