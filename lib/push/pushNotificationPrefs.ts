import type { EmailNotificationKey } from '../emailNotificationKeys.js';
import { EMAIL_NOTIFICATION_KEYS } from '../emailNotificationKeys.js';
import type { PushOptions } from '../pushSubscriptions.js';

export const PUSH_NOTIFICATION_KEYS = EMAIL_NOTIFICATION_KEYS;

export type PushNotificationKey = EmailNotificationKey;

type SettingsWithPush = {
  all?: {
    pushNotifications?: Record<string, boolean | undefined>;
  };
};

function defaultEnabled(key: PushNotificationKey): boolean {
  return key !== 'announcements';
}

/** Opt-out per category; mirrors email defaults (announcements off by default). */
export function pushNotificationsEnabled(
  settings: SettingsWithPush | undefined,
  key: PushNotificationKey,
): boolean {
  const pushNotifications = settings?.all?.pushNotifications;
  if (pushNotifications === undefined) {
    return defaultEnabled(key);
  }
  if (!Object.prototype.hasOwnProperty.call(pushNotifications, key)) {
    return defaultEnabled(key);
  }
  return pushNotifications[key] === true;
}

export function prefKeyForPushTopic(
  topic: PushOptions['topic'],
  hint?: PushNotificationKey,
): PushNotificationKey | 'test' {
  if (topic === 'test') {
    return 'test';
  }
  if (hint !== undefined) {
    return hint;
  }
  switch (topic) {
    case 'yourturn':
      return 'yourturn';
    case 'ended':
      return 'gameEnd';
    case 'started':
      return 'gameStart';
    case 'challenges':
      return 'challenges';
    case 'tournament':
      return 'tournamentEnd';
    case 'event':
      return 'eventEnd';
    case 'announcements':
      return 'announcements';
    default:
      return 'yourturn';
  }
}

export function defaultPushNotificationsMap(
  existing?: Record<string, boolean | undefined>,
): Record<PushNotificationKey, boolean> {
  const settings = { ...existing } as Record<string, boolean>;
  for (const key of PUSH_NOTIFICATION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) {
      settings[key] = defaultEnabled(key as PushNotificationKey);
    }
  }
  return settings as Record<PushNotificationKey, boolean>;
}