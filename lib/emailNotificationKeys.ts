/** Game/ops notification email prefs (keep in sync with front notificationPrefs.js). Push uses the same keys under `settings.all.pushNotifications`. */
export const EMAIL_NOTIFICATION_KEYS = [
  'challenges',
  'gameStart',
  'gameEnd',
  'yourturn',
  'tournamentStart',
  'tournamentEnd',
  'eventEnd',
  'announcements',
] as const;

export type EmailNotificationKey = (typeof EMAIL_NOTIFICATION_KEYS)[number];