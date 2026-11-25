import webpush from 'web-push';
import { formatReturnError, logGetItemError } from '../api/http.js';
import type { UserSettings } from '../api/types.js';
import {
  type PushOptions,
  queryPushSubscriptions,
  sendPushToSubscriptions,
} from '../pushSubscriptions.js';
import {
  prefKeyForPushTopic,
  pushNotificationsEnabled,
  type PushNotificationKey,
} from './pushNotificationPrefs.js';

export type PushSettingsArg =
  | UserSettings
  | Parameters<typeof pushNotificationsEnabled>[0]
  | { all?: { pushNotifications?: Record<string, boolean | undefined> } };

export async function sendUserPush(opts: PushOptions) {
  console.log(`Sending push: ${JSON.stringify(opts)}`);
  const { userId } = opts;
  let subscriptions;
  try {
    subscriptions = await queryPushSubscriptions(userId);
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fetch push credentials for ${userId}`);
  }

  await sendPushToSubscriptions(opts, subscriptions, webpush.sendNotification.bind(webpush), logGetItemError);
}

export async function sendUserPushIfEnabled(
  opts: PushOptions,
  settings?: PushSettingsArg,
): Promise<void> {
  const prefKey = opts.prefKey ?? prefKeyForPushTopic(opts.topic);
  if (prefKey !== 'test') {
    if (!pushNotificationsEnabled(settings, prefKey as PushNotificationKey)) {
      console.log(
        `Skipping push for ${opts.userId}: category "${prefKey}" disabled in pushNotifications`,
      );
      return;
    }
  }
  await sendUserPush(opts);
}