import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  NOTIFICATION_INITIAL_TTL_DAYS,
  NOTIFICATION_SEEN_TTL_DAYS,
  buildNotificationItem,
  dismissNotification,
  backfillCompletedGameChatNotification,
  hasActiveCompletedGameChatNotification,
  hasActiveEventInvitationNotification,
  inAppCategoryForBody,
  loadNotificationsForDashboard,
  notificationInitialExpiresAt,
  notificationPk,
  notificationSeenExpiresAt,
  parseNotificationCreatedAt,
  putNotificationItem,
  wantsInAppNotification,
} from '../lib/notifications';

const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const OTHER_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const GAME_ID = 'game-chat-1';
const SEC_PER_DAY = 86_400;

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}:${item.sk}`;
}

type Store = Map<string, Record<string, unknown>>;

function createMockDocClient(store: Store) {
  return {
    async send(command: unknown) {
      if (command instanceof PutCommand) {
        const item = command.input.Item as Record<string, unknown>;
        store.set(itemKey(item as { pk: string; sk: string }), { ...item });
        return {};
      }
      if (command instanceof DeleteCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        store.delete(itemKey(key));
        return {};
      }
      if (command instanceof UpdateCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        const existing = store.get(itemKey(key));
        assert.ok(existing, 'update target must exist');
        const values = command.input.ExpressionAttributeValues as { ':exp': number };
        existing.expiresAt = values[':exp'];
        store.set(itemKey(key), existing);
        return {};
      }
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        if (key.pk === 'BOT') {
          return {};
        }
        const item = store.get(itemKey(key));
        return item ? { Item: { ...item } } : {};
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
        const sk = command.input.ExpressionAttributeValues?.[':sk'] as string | undefined;
        let items = [...store.values()].filter(item => item.pk === pk);
        if (sk !== undefined) {
          items = items.filter(item => item.sk === sk);
        }
        if (command.input.ScanIndexForward === false) {
          items.sort((a, b) => String(b.sk).localeCompare(String(a.sk)));
        }
        if (command.input.Limit === 1) {
          items = items.slice(0, 1);
        }
        return { Items: items };
      }
      throw new Error(`Unexpected command: ${(command as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'}`);
    },
  };
}

test('notificationPk uses NOTIFICATION# prefix', () => {
  assert.equal(notificationPk(USER_ID), `NOTIFICATION#${USER_ID}`);
});

test('parseNotificationCreatedAt reads sk epoch prefix', () => {
  assert.equal(parseNotificationCreatedAt('1700000000000#abc'), 1700000000000);
});

describe('inApp notification prefs', () => {
  test('wantsInAppNotification defaults to true when prefs missing', () => {
    assert.equal(wantsInAppNotification(undefined, 'gameStart'), true);
    assert.equal(wantsInAppNotification({}, 'ratingChange'), true);
    assert.equal(wantsInAppNotification({ all: {} }, 'challenges'), true);
  });

  test('wantsInAppNotification respects explicit false', () => {
    assert.equal(
      wantsInAppNotification({
        all: { inAppNotifications: { gameEnd: false } },
      }, 'gameEnd'),
      false,
    );
  });

  test('inAppCategoryForBody maps challenge types to challenges', () => {
    assert.equal(
      inAppCategoryForBody({
        type: 'challengeIssued',
        challengeId: 'c1',
        metaGame: 'go',
        challengerId: 'u2',
        challengerName: 'Bob',
      }),
      'challenges',
    );
    assert.equal(
      inAppCategoryForBody({
        type: 'ratingChange',
        metaGame: 'go',
        variants: [],
        oldRating: 1000,
        newRating: 1010,
        oldRd: 80,
        newRd: 70,
        oldProvisional: false,
        newProvisional: false,
        delta: 10,
      }),
      'ratingChange',
    );
    assert.equal(
      inAppCategoryForBody({
        type: 'tournamentStart',
        tournamentId: 'tour-1',
        metaGame: 'go',
        number: 3,
        variants: [],
      }),
      'tournamentStart',
    );
    assert.equal(
      inAppCategoryForBody({
        type: 'tournamentEnd',
        tournamentId: 'tour-1',
        metaGame: 'go',
        number: 3,
        variants: ['small'],
        winnerName: 'Alice',
      }),
      'tournamentEnd',
    );
  });
});

describe('putNotificationItem', () => {
  it('writes without in-app pref gating', async () => {
    const store: Store = new Map();
    const client = createMockDocClient(store);

    await putNotificationItem(client as never, TABLE, USER_ID, {
      type: 'completedGameChat',
      gameId: GAME_ID,
      metaGame: 'go',
      variants: [],
      commenterId: '',
      commenterName: '',
      backfill: true,
    });

    assert.equal(store.size, 1);
  });
});

test('buildNotificationItem sets initial 6-month expiresAt', () => {
  const now = Date.now();
  const expected = notificationInitialExpiresAt(now);
  const item = buildNotificationItem(USER_ID, {
    type: 'challengeIssued',
    challengeId: 'c1',
    metaGame: 'go',
    challengerId: 'u2',
    challengerName: 'Bob',
  }, now);

  assert.equal(item.pk, notificationPk(USER_ID));
  assert.equal(item.body.type, 'challengeIssued');
  assert.ok(Math.abs(item.expiresAt - expected) <= 1);
});

test('tournamentEnd body carries tournament page link fields and optional winner', () => {
  const item = buildNotificationItem(USER_ID, {
    type: 'tournamentEnd',
    tournamentId: 'tour-abc',
    metaGame: 'go',
    number: 5,
    variants: ['small'],
    winnerName: 'Alice',
  });
  assert.equal(item.body.type, 'tournamentEnd');
  if (item.body.type !== 'tournamentEnd') {
    return;
  }
  assert.equal(item.body.tournamentId, 'tour-abc');
  assert.equal(item.body.metaGame, 'go');
  assert.equal(item.body.number, 5);
  assert.deepEqual(item.body.variants, ['small']);
  assert.equal(item.body.winnerName, 'Alice');
});

test('eventInvitation body carries event page link fields', () => {
  const item = buildNotificationItem(USER_ID, {
    type: 'eventInvitation',
    eventId: 'evt-abc',
    eventName: 'Spring Open',
    organizerId: 'org-1',
    organizerName: 'Alice',
  });
  assert.equal(item.body.type, 'eventInvitation');
  if (item.body.type !== 'eventInvitation') {
    return;
  }
  assert.equal(item.body.eventId, 'evt-abc');
  assert.equal(item.body.eventName, 'Spring Open');
  assert.equal(item.body.organizerId, 'org-1');
  assert.equal(item.body.organizerName, 'Alice');
});

test('completedGameChat body carries game link fields', () => {
  const item = buildNotificationItem(USER_ID, {
    type: 'completedGameChat',
    gameId: GAME_ID,
    metaGame: 'go',
    variants: ['small'],
    commenterId: OTHER_USER_ID,
    commenterName: 'Bob',
  });
  assert.equal(item.body.type, 'completedGameChat');
  if (item.body.type !== 'completedGameChat') {
    return;
  }
  assert.equal(item.body.gameId, GAME_ID);
  assert.equal(item.body.metaGame, 'go');
  assert.deepEqual(item.body.variants, ['small']);
  assert.equal(item.body.commenterId, OTHER_USER_ID);
  assert.equal(item.body.commenterName, 'Bob');
});

test('backfillCompletedGameChatNotification writes backfill flag and skips dup', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store);

  const first = await backfillCompletedGameChatNotification(
    client as never,
    TABLE,
    USER_ID,
    GAME_ID,
    'go',
    [],
  );
  assert.equal(first, 'created');
  assert.equal(store.size, 1);
  const item = [...store.values()][0];
  const body = item.body as { type: string; backfill?: boolean; commenterName: string };
  assert.equal(body.type, 'completedGameChat');
  assert.equal(body.backfill, true);
  assert.equal(body.commenterName, '');

  const second = await backfillCompletedGameChatNotification(
    client as never,
    TABLE,
    USER_ID,
    GAME_ID,
    'go',
  );
  assert.equal(second, 'skipped_dup');
  assert.equal(store.size, 1);
});

test('hasActiveCompletedGameChatNotification finds non-expired notification for game', async () => {
  const store: Store = new Map([
    [itemKey({
      pk: notificationPk(USER_ID),
      sk: '2000#chat',
    }), {
      pk: notificationPk(USER_ID),
      sk: '2000#chat',
      body: {
        type: 'completedGameChat',
        gameId: GAME_ID,
        metaGame: 'go',
        variants: [],
        commenterId: OTHER_USER_ID,
        commenterName: 'Bob',
      },
      expiresAt: notificationSeenExpiresAt(),
    }],
  ]);
  const client = createMockDocClient(store);

  assert.equal(
    await hasActiveCompletedGameChatNotification(client as never, TABLE, USER_ID, GAME_ID),
    true,
  );
  assert.equal(
    await hasActiveCompletedGameChatNotification(client as never, TABLE, USER_ID, 'other-game'),
    false,
  );
});

test('hasActiveEventInvitationNotification finds non-expired invite for event', async () => {
  const eventId = 'evt-abc';
  const store: Store = new Map([
    [itemKey({
      pk: notificationPk(USER_ID),
      sk: '2000#invite',
    }), {
      pk: notificationPk(USER_ID),
      sk: '2000#invite',
      body: {
        type: 'eventInvitation',
        eventId,
        eventName: 'Spring Open',
        organizerId: 'org-1',
        organizerName: 'Alice',
      },
      expiresAt: notificationSeenExpiresAt(),
    }],
  ]);
  const client = createMockDocClient(store);

  assert.equal(
    await hasActiveEventInvitationNotification(client as never, TABLE, USER_ID, eventId),
    true,
  );
  assert.equal(
    await hasActiveEventInvitationNotification(client as never, TABLE, USER_ID, 'other-event'),
    false,
  );
});

describe('loadNotificationsForDashboard', () => {
  it('deletes expired items and returns survivors', async () => {
    const store: Store = new Map([
      [itemKey({ pk: notificationPk(USER_ID), sk: '1000#old' }), {
        pk: notificationPk(USER_ID),
        sk: '1000#old',
        body: { type: 'gameEnd', gameId: 'g-old', metaGame: 'go', variants: [], result: 'lose' },
        expiresAt: 1,
      }],
      [itemKey({ pk: notificationPk(USER_ID), sk: '2000#live' }), {
        pk: notificationPk(USER_ID),
        sk: '2000#live',
        body: { type: 'gameEnd', gameId: 'g-live', metaGame: 'go', variants: [], result: 'win' },
        expiresAt: notificationSeenExpiresAt(),
      }],
    ]);
    const client = createMockDocClient(store);

    const notifications = await loadNotificationsForDashboard(
      client as never,
      TABLE,
      USER_ID,
      { refreshExpiry: false },
    );

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].sk, '2000#live');
    assert.equal(notifications[0].createdAt, 2000);
    assert.equal(store.size, 1);
    assert.equal(store.has(itemKey({ pk: notificationPk(USER_ID), sk: '1000#old' })), false);
  });

  it('tightens long TTL only when refreshExpiry is true', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const longSk = '3000#long';
    {
      const store: Store = new Map([
        [itemKey({ pk: notificationPk(USER_ID), sk: longSk }), {
          pk: notificationPk(USER_ID),
          sk: longSk,
          body: { type: 'eventInvitation', eventId: 'e1', eventName: 'Cup', organizerId: 'o1', organizerName: 'Org' },
          expiresAt: nowSec + NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY,
        }],
        [itemKey({ pk: notificationPk(USER_ID), sk: '4000#short' }), {
          pk: notificationPk(USER_ID),
          sk: '4000#short',
          body: { type: 'eventInvitation', eventId: 'e2', eventName: 'Cup2', organizerId: 'o1', organizerName: 'Org' },
          expiresAt: notificationSeenExpiresAt(),
        }],
      ]);
      const client = createMockDocClient(store);

      const notifications = await loadNotificationsForDashboard(
        client as never,
        TABLE,
        USER_ID,
        { refreshExpiry: true },
      );

      assert.equal(notifications.length, 2);
      const longItem = store.get(itemKey({ pk: notificationPk(USER_ID), sk: longSk }));
      const shortItem = store.get(itemKey({ pk: notificationPk(USER_ID), sk: '4000#short' }));
      assert.ok(longItem);
      assert.ok(shortItem);
      assert.ok(Math.abs((longItem.expiresAt as number) - notificationSeenExpiresAt()) <= 1);
      assert.equal(shortItem.expiresAt, notificationSeenExpiresAt());
    }
  });

  it('does not tighten TTL when refreshExpiry is false', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const longExpires = nowSec + NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY;
    const store: Store = new Map([
      [itemKey({ pk: notificationPk(USER_ID), sk: '5000#long' }), {
        pk: notificationPk(USER_ID),
        sk: '5000#long',
        body: { type: 'challengeRevoked', challengeId: 'c1', metaGame: 'go', revokerId: 'u2', revokerName: 'Bob' },
        expiresAt: longExpires,
      }],
    ]);
    const client = createMockDocClient(store);

    await loadNotificationsForDashboard(client as never, TABLE, USER_ID, { refreshExpiry: false });

    const item = store.get(itemKey({ pk: notificationPk(USER_ID), sk: '5000#long' }));
    assert.equal(item?.expiresAt, longExpires);
  });
});

describe('dismissNotification', () => {
  it('deletes owned notification', async () => {
    const sk = '6000#abc';
    const store: Store = new Map([
      [itemKey({ pk: notificationPk(USER_ID), sk }), {
        pk: notificationPk(USER_ID),
        sk,
        body: { type: 'challengeDeclined', challengeId: 'c1', metaGame: 'go', declinerId: 'u2', declinerName: 'Bob' },
        expiresAt: notificationSeenExpiresAt(),
      }],
    ]);
    const client = createMockDocClient(store);

    const ok = await dismissNotification(client as never, TABLE, USER_ID, sk);
    assert.equal(ok, true);
    assert.equal(store.size, 0);
  });

  it('returns false when notification is missing', async () => {
    const ok = await dismissNotification(
      createMockDocClient(new Map()) as never,
      TABLE,
      USER_ID,
      'missing#sk',
    );
    assert.equal(ok, false);
  });
});
