import { describe, expect, it } from 'vitest';
import { EMAIL_NOTIFICATION_KEYS } from '../lib/emailNotificationKeys.js';
import { settingsWithAllEmailNotificationsOff } from '../lib/emailUnsubscribeSettings.js';

describe('settingsWithAllEmailNotificationsOff', () => {
  it('turns off email notification keys and keeps other settings', () => {
    const input = {
      all: {
        notifications: {
          challenges: true,
          yourturn: true,
          announcements: true,
        },
        profile: { name: 'Ada' },
      },
      gameFoo: { colour: 'red' },
    };
    const next = settingsWithAllEmailNotificationsOff(input);
    const notifications = (next.all as Record<string, unknown>).notifications as Record<string, boolean>;
    for (const key of EMAIL_NOTIFICATION_KEYS) {
      expect(notifications[key]).toBe(false);
    }
    expect((next.all as Record<string, unknown>).profile).toEqual({ name: 'Ada' });
    expect(next.gameFoo).toEqual({ colour: 'red' });
  });
});