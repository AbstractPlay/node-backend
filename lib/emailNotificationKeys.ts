/** Game/ops notification email prefs (keep in sync with front notificationPrefs.js). */
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