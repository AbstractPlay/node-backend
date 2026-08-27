"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const notifications_1 = require("../lib/notifications");
const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const OTHER_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const GAME_ID = 'game-chat-1';
const SEC_PER_DAY = 86400;
function itemKey(item) {
    return `${item.pk}:${item.sk}`;
}
function createMockDocClient(store) {
    return {
        async send(command) {
            if (command instanceof lib_dynamodb_1.PutCommand) {
                const item = command.input.Item;
                store.set(itemKey(item), { ...item });
                return {};
            }
            if (command instanceof lib_dynamodb_1.DeleteCommand) {
                const key = command.input.Key;
                store.delete(itemKey(key));
                return {};
            }
            if (command instanceof lib_dynamodb_1.UpdateCommand) {
                const key = command.input.Key;
                const existing = store.get(itemKey(key));
                strict_1.default.ok(existing, 'update target must exist');
                const values = command.input.ExpressionAttributeValues;
                existing.expiresAt = values[':exp'];
                store.set(itemKey(key), existing);
                return {};
            }
            if (command instanceof lib_dynamodb_1.GetCommand) {
                const key = command.input.Key;
                if (key.pk === 'BOT') {
                    return {};
                }
                const item = store.get(itemKey(key));
                return item ? { Item: { ...item } } : {};
            }
            if (command instanceof lib_dynamodb_1.QueryCommand) {
                const pk = command.input.ExpressionAttributeValues?.[':pk'];
                const sk = command.input.ExpressionAttributeValues?.[':sk'];
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
            throw new Error(`Unexpected command: ${command.constructor?.name ?? 'unknown'}`);
        },
    };
}
(0, node_test_1.test)('notificationPk uses NOTIFICATION# prefix', () => {
    strict_1.default.equal((0, notifications_1.notificationPk)(USER_ID), `NOTIFICATION#${USER_ID}`);
});
(0, node_test_1.test)('parseNotificationCreatedAt reads sk epoch prefix', () => {
    strict_1.default.equal((0, notifications_1.parseNotificationCreatedAt)('1700000000000#abc'), 1700000000000);
});
(0, node_test_1.describe)('inApp notification prefs', () => {
    (0, node_test_1.test)('wantsInAppNotification defaults to true when prefs missing', () => {
        strict_1.default.equal((0, notifications_1.wantsInAppNotification)(undefined, 'gameStart'), true);
        strict_1.default.equal((0, notifications_1.wantsInAppNotification)({}, 'ratingChange'), true);
        strict_1.default.equal((0, notifications_1.wantsInAppNotification)({ all: {} }, 'challenges'), true);
    });
    (0, node_test_1.test)('wantsInAppNotification respects explicit false', () => {
        strict_1.default.equal((0, notifications_1.wantsInAppNotification)({
            all: { inAppNotifications: { gameEnd: false } },
        }, 'gameEnd'), false);
    });
    (0, node_test_1.test)('inAppCategoryForBody maps challenge types to challenges', () => {
        strict_1.default.equal((0, notifications_1.inAppCategoryForBody)({
            type: 'challengeIssued',
            challengeId: 'c1',
            metaGame: 'go',
            challengerId: 'u2',
            challengerName: 'Bob',
        }), 'challenges');
        strict_1.default.equal((0, notifications_1.inAppCategoryForBody)({
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
        }), 'ratingChange');
    });
});
(0, node_test_1.describe)('putNotificationItem', () => {
    (0, node_test_1.it)('writes without in-app pref gating', async () => {
        const store = new Map();
        const client = createMockDocClient(store);
        await (0, notifications_1.putNotificationItem)(client, TABLE, USER_ID, {
            type: 'completedGameChat',
            gameId: GAME_ID,
            metaGame: 'go',
            variants: [],
            commenterId: '',
            commenterName: '',
            backfill: true,
        });
        strict_1.default.equal(store.size, 1);
    });
});
(0, node_test_1.test)('buildNotificationItem sets initial 6-month expiresAt', () => {
    const now = Date.now();
    const expected = (0, notifications_1.notificationInitialExpiresAt)(now);
    const item = (0, notifications_1.buildNotificationItem)(USER_ID, {
        type: 'challengeIssued',
        challengeId: 'c1',
        metaGame: 'go',
        challengerId: 'u2',
        challengerName: 'Bob',
    }, now);
    strict_1.default.equal(item.pk, (0, notifications_1.notificationPk)(USER_ID));
    strict_1.default.equal(item.body.type, 'challengeIssued');
    strict_1.default.ok(Math.abs(item.expiresAt - expected) <= 1);
});
(0, node_test_1.test)('eventInvitation body carries event page link fields', () => {
    const item = (0, notifications_1.buildNotificationItem)(USER_ID, {
        type: 'eventInvitation',
        eventId: 'evt-abc',
        eventName: 'Spring Open',
        organizerId: 'org-1',
        organizerName: 'Alice',
    });
    strict_1.default.equal(item.body.type, 'eventInvitation');
    if (item.body.type !== 'eventInvitation') {
        return;
    }
    strict_1.default.equal(item.body.eventId, 'evt-abc');
    strict_1.default.equal(item.body.eventName, 'Spring Open');
    strict_1.default.equal(item.body.organizerId, 'org-1');
    strict_1.default.equal(item.body.organizerName, 'Alice');
});
(0, node_test_1.test)('completedGameChat body carries game link fields', () => {
    const item = (0, notifications_1.buildNotificationItem)(USER_ID, {
        type: 'completedGameChat',
        gameId: GAME_ID,
        metaGame: 'go',
        variants: ['small'],
        commenterId: OTHER_USER_ID,
        commenterName: 'Bob',
    });
    strict_1.default.equal(item.body.type, 'completedGameChat');
    if (item.body.type !== 'completedGameChat') {
        return;
    }
    strict_1.default.equal(item.body.gameId, GAME_ID);
    strict_1.default.equal(item.body.metaGame, 'go');
    strict_1.default.deepEqual(item.body.variants, ['small']);
    strict_1.default.equal(item.body.commenterId, OTHER_USER_ID);
    strict_1.default.equal(item.body.commenterName, 'Bob');
});
(0, node_test_1.test)('backfillCompletedGameChatNotification writes backfill flag and skips dup', async () => {
    const store = new Map();
    const client = createMockDocClient(store);
    const first = await (0, notifications_1.backfillCompletedGameChatNotification)(client, TABLE, USER_ID, GAME_ID, 'go', []);
    strict_1.default.equal(first, 'created');
    strict_1.default.equal(store.size, 1);
    const item = [...store.values()][0];
    const body = item.body;
    strict_1.default.equal(body.type, 'completedGameChat');
    strict_1.default.equal(body.backfill, true);
    strict_1.default.equal(body.commenterName, '');
    const second = await (0, notifications_1.backfillCompletedGameChatNotification)(client, TABLE, USER_ID, GAME_ID, 'go');
    strict_1.default.equal(second, 'skipped_dup');
    strict_1.default.equal(store.size, 1);
});
(0, node_test_1.test)('hasActiveCompletedGameChatNotification finds non-expired notification for game', async () => {
    const store = new Map([
        [itemKey({
                pk: (0, notifications_1.notificationPk)(USER_ID),
                sk: '2000#chat',
            }), {
                pk: (0, notifications_1.notificationPk)(USER_ID),
                sk: '2000#chat',
                body: {
                    type: 'completedGameChat',
                    gameId: GAME_ID,
                    metaGame: 'go',
                    variants: [],
                    commenterId: OTHER_USER_ID,
                    commenterName: 'Bob',
                },
                expiresAt: (0, notifications_1.notificationSeenExpiresAt)(),
            }],
    ]);
    const client = createMockDocClient(store);
    strict_1.default.equal(await (0, notifications_1.hasActiveCompletedGameChatNotification)(client, TABLE, USER_ID, GAME_ID), true);
    strict_1.default.equal(await (0, notifications_1.hasActiveCompletedGameChatNotification)(client, TABLE, USER_ID, 'other-game'), false);
});
(0, node_test_1.test)('hasActiveEventInvitationNotification finds non-expired invite for event', async () => {
    const eventId = 'evt-abc';
    const store = new Map([
        [itemKey({
                pk: (0, notifications_1.notificationPk)(USER_ID),
                sk: '2000#invite',
            }), {
                pk: (0, notifications_1.notificationPk)(USER_ID),
                sk: '2000#invite',
                body: {
                    type: 'eventInvitation',
                    eventId,
                    eventName: 'Spring Open',
                    organizerId: 'org-1',
                    organizerName: 'Alice',
                },
                expiresAt: (0, notifications_1.notificationSeenExpiresAt)(),
            }],
    ]);
    const client = createMockDocClient(store);
    strict_1.default.equal(await (0, notifications_1.hasActiveEventInvitationNotification)(client, TABLE, USER_ID, eventId), true);
    strict_1.default.equal(await (0, notifications_1.hasActiveEventInvitationNotification)(client, TABLE, USER_ID, 'other-event'), false);
});
(0, node_test_1.describe)('loadNotificationsForDashboard', () => {
    (0, node_test_1.it)('deletes expired items and returns survivors', async () => {
        const store = new Map([
            [itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '1000#old' }), {
                    pk: (0, notifications_1.notificationPk)(USER_ID),
                    sk: '1000#old',
                    body: { type: 'gameEnd', gameId: 'g-old', metaGame: 'go', variants: [], result: 'lose' },
                    expiresAt: 1,
                }],
            [itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '2000#live' }), {
                    pk: (0, notifications_1.notificationPk)(USER_ID),
                    sk: '2000#live',
                    body: { type: 'gameEnd', gameId: 'g-live', metaGame: 'go', variants: [], result: 'win' },
                    expiresAt: (0, notifications_1.notificationSeenExpiresAt)(),
                }],
        ]);
        const client = createMockDocClient(store);
        const notifications = await (0, notifications_1.loadNotificationsForDashboard)(client, TABLE, USER_ID, { refreshExpiry: false });
        strict_1.default.equal(notifications.length, 1);
        strict_1.default.equal(notifications[0].sk, '2000#live');
        strict_1.default.equal(notifications[0].createdAt, 2000);
        strict_1.default.equal(store.size, 1);
        strict_1.default.equal(store.has(itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '1000#old' })), false);
    });
    (0, node_test_1.it)('tightens long TTL only when refreshExpiry is true', async () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const longSk = '3000#long';
        {
            const store = new Map([
                [itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: longSk }), {
                        pk: (0, notifications_1.notificationPk)(USER_ID),
                        sk: longSk,
                        body: { type: 'eventInvitation', eventId: 'e1', eventName: 'Cup', organizerId: 'o1', organizerName: 'Org' },
                        expiresAt: nowSec + notifications_1.NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY,
                    }],
                [itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '4000#short' }), {
                        pk: (0, notifications_1.notificationPk)(USER_ID),
                        sk: '4000#short',
                        body: { type: 'eventInvitation', eventId: 'e2', eventName: 'Cup2', organizerId: 'o1', organizerName: 'Org' },
                        expiresAt: (0, notifications_1.notificationSeenExpiresAt)(),
                    }],
            ]);
            const client = createMockDocClient(store);
            const notifications = await (0, notifications_1.loadNotificationsForDashboard)(client, TABLE, USER_ID, { refreshExpiry: true });
            strict_1.default.equal(notifications.length, 2);
            const longItem = store.get(itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: longSk }));
            const shortItem = store.get(itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '4000#short' }));
            strict_1.default.ok(longItem);
            strict_1.default.ok(shortItem);
            strict_1.default.ok(Math.abs(longItem.expiresAt - (0, notifications_1.notificationSeenExpiresAt)()) <= 1);
            strict_1.default.equal(shortItem.expiresAt, (0, notifications_1.notificationSeenExpiresAt)());
        }
    });
    (0, node_test_1.it)('does not tighten TTL when refreshExpiry is false', async () => {
        const nowSec = Math.floor(Date.now() / 1000);
        const longExpires = nowSec + notifications_1.NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY;
        const store = new Map([
            [itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '5000#long' }), {
                    pk: (0, notifications_1.notificationPk)(USER_ID),
                    sk: '5000#long',
                    body: { type: 'challengeRevoked', challengeId: 'c1', metaGame: 'go', revokerId: 'u2', revokerName: 'Bob' },
                    expiresAt: longExpires,
                }],
        ]);
        const client = createMockDocClient(store);
        await (0, notifications_1.loadNotificationsForDashboard)(client, TABLE, USER_ID, { refreshExpiry: false });
        const item = store.get(itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk: '5000#long' }));
        strict_1.default.equal(item?.expiresAt, longExpires);
    });
});
(0, node_test_1.describe)('dismissNotification', () => {
    (0, node_test_1.it)('deletes owned notification', async () => {
        const sk = '6000#abc';
        const store = new Map([
            [itemKey({ pk: (0, notifications_1.notificationPk)(USER_ID), sk }), {
                    pk: (0, notifications_1.notificationPk)(USER_ID),
                    sk,
                    body: { type: 'challengeDeclined', challengeId: 'c1', metaGame: 'go', declinerId: 'u2', declinerName: 'Bob' },
                    expiresAt: (0, notifications_1.notificationSeenExpiresAt)(),
                }],
        ]);
        const client = createMockDocClient(store);
        const ok = await (0, notifications_1.dismissNotification)(client, TABLE, USER_ID, sk);
        strict_1.default.equal(ok, true);
        strict_1.default.equal(store.size, 0);
    });
    (0, node_test_1.it)('returns false when notification is missing', async () => {
        const ok = await (0, notifications_1.dismissNotification)(createMockDocClient(new Map()), TABLE, USER_ID, 'missing#sk');
        strict_1.default.equal(ok, false);
    });
});
