import { describe, expect, it } from 'vitest';
import {
  defaultPushNotificationsMap,
  prefKeyForPushTopic,
  pushNotificationsEnabled,
} from '../lib/push/pushNotificationPrefs.js';

describe('pushNotificationsEnabled', () => {
  it('defaults announcements off and other categories on', () => {
    expect(pushNotificationsEnabled(undefined, 'yourturn')).toBe(true);
    expect(pushNotificationsEnabled(undefined, 'announcements')).toBe(false);
  });

  it('respects explicit pushNotifications map', () => {
    expect(
      pushNotificationsEnabled(
        { all: { pushNotifications: { yourturn: false, challenges: true } } },
        'yourturn',
      ),
    ).toBe(false);
    expect(
      pushNotificationsEnabled(
        { all: { pushNotifications: { yourturn: false, challenges: true } } },
        'challenges',
      ),
    ).toBe(true);
  });
});

describe('prefKeyForPushTopic', () => {
  it('maps topics to preference keys', () => {
    expect(prefKeyForPushTopic('yourturn')).toBe('yourturn');
    expect(prefKeyForPushTopic('ended')).toBe('gameEnd');
    expect(prefKeyForPushTopic('started')).toBe('gameStart');
    expect(prefKeyForPushTopic('test')).toBe('test');
  });

  it('honours hint override', () => {
    expect(prefKeyForPushTopic('tournament', 'tournamentStart')).toBe('tournamentStart');
  });
});

describe('defaultPushNotificationsMap', () => {
  it('fills missing keys with defaults', () => {
    expect(defaultPushNotificationsMap({ yourturn: false }).yourturn).toBe(false);
    expect(defaultPushNotificationsMap({ yourturn: false }).announcements).toBe(false);
    expect(defaultPushNotificationsMap({}).challenges).toBe(true);
  });
});