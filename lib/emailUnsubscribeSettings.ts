import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb.js';
import { EMAIL_NOTIFICATION_KEYS } from './emailNotificationKeys.js';
import { stripColorFromSettings } from './stripLegacyColorSettings.js';
import {
  feedbackNewKindsFromSettings,
  syncFeedbackNewNotifyIndex,
} from './feedback/feedbackNewNotifyIndex.js';
import { syncAnnouncementNotifyIndex } from './announcements/announcementNotifyIndex.js';

export function settingsWithAllEmailNotificationsOff(
  settings: unknown,
): Record<string, unknown> {
  const base =
    stripColorFromSettings(
      structuredClone(settings ?? {}) as Record<string, unknown>,
    ) as Record<string, unknown>;
  const all = (base.all as Record<string, unknown> | undefined) ?? {};
  const notifications = {
    ...((all.notifications as Record<string, boolean> | undefined) ?? {}),
  };
  for (const key of EMAIL_NOTIFICATION_KEYS) {
    notifications[key] = false;
  }
  all.notifications = notifications;
  base.all = all;
  return base;
}

export async function disableAllEmailNotifications(
  userid: string,
): Promise<'ok' | 'not_found'> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE is not set');
  }
  const existing = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userid },
    }),
  );
  if (!existing.Item) {
    return 'not_found';
  }
  const settings = settingsWithAllEmailNotificationsOff(existing.Item.settings);

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userid },
      ExpressionAttributeValues: { ':ss': settings },
      UpdateExpression: 'set settings = :ss',
    }),
  );

  const feedbackTable = process.env.FEEDBACK_TABLE;
  if (feedbackTable) {
    try {
      const kinds = feedbackNewKindsFromSettings(settings);
      await syncFeedbackNewNotifyIndex(ddbDocClient, feedbackTable, userid, kinds);
    } catch (syncErr) {
      console.error('syncFeedbackNewNotifyIndex failed', syncErr);
    }
  }

  try {
    await syncAnnouncementNotifyIndex(ddbDocClient, tableName, userid, settings);
  } catch (syncErr) {
    console.error('syncAnnouncementNotifyIndex failed', syncErr);
  }

  return 'ok';
}