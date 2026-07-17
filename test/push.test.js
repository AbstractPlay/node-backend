"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const pushSubscriptions_1 = require("../lib/pushSubscriptions");
const TABLE = 'abstract-play-test';
const USER_ID = 'user-123';
const ENDPOINT_A = 'https://push.example/a';
const ENDPOINT_B = 'https://push.example/b';
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
            if (command instanceof lib_dynamodb_1.GetCommand) {
                const { pk, sk } = command.input.Key;
                const item = store.get(`${pk}:${sk}`);
                return { Item: item };
            }
            if (command instanceof lib_dynamodb_1.DeleteCommand) {
                const { pk, sk } = command.input.Key;
                store.delete(`${pk}:${sk}`);
                return {};
            }
            if (command instanceof lib_dynamodb_1.QueryCommand) {
                const pk = command.input.ExpressionAttributeValues?.[':pk'];
                const skPrefix = command.input.ExpressionAttributeValues?.[':skPrefix'];
                const items = [...store.values()].filter((item) => {
                    const sk = item.sk;
                    return item.pk === pk && sk.startsWith(skPrefix);
                });
                return { Items: items };
            }
            throw new Error('Unsupported command');
        },
    };
}
let store;
(0, node_test_1.beforeEach)(() => {
    store = new Map();
    process.env.ABSTRACT_PLAY_TABLE = TABLE;
    process.env.VAPID_PUBLIC_KEY = 'test-public';
    process.env.VAPID_PRIVATE_KEY = 'test-private';
    (0, pushSubscriptions_1.__setDocClientForTests)(createMockDocClient(store));
});
(0, node_test_1.afterEach)(() => {
    (0, pushSubscriptions_1.__setDocClientForTests)(undefined);
});
(0, node_test_1.test)('pushSubscriptionKey is stable and 16 hex chars', () => {
    const key = (0, pushSubscriptions_1.pushSubscriptionKey)(ENDPOINT_A);
    strict_1.default.equal(key, (0, pushSubscriptions_1.pushSubscriptionKey)(ENDPOINT_A));
    strict_1.default.match(key, /^[0-9a-f]{16}$/);
});
(0, node_test_1.test)('pushSortKey combines user id and endpoint hash', () => {
    strict_1.default.equal((0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A), `${USER_ID}#${(0, pushSubscriptions_1.pushSubscriptionKey)(ENDPOINT_A)}`);
});
(0, node_test_1.test)('savePushSubscription creates distinct records for different endpoints', async () => {
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_A, keys: { a: 1 } });
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_B, keys: { b: 2 } });
    const subscriptions = await (0, pushSubscriptions_1.queryPushSubscriptions)(USER_ID);
    strict_1.default.equal(subscriptions.length, 2);
    strict_1.default.equal(subscriptions[0].sk, (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A));
    strict_1.default.equal(subscriptions[1].sk, (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_B));
});
(0, node_test_1.test)('savePushSubscription upserts the same endpoint', async () => {
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_A, keys: { v: 1 } });
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_A, keys: { v: 2 } });
    const subscriptions = await (0, pushSubscriptions_1.queryPushSubscriptions)(USER_ID);
    strict_1.default.equal(subscriptions.length, 1);
    strict_1.default.deepEqual(subscriptions[0].payload, { endpoint: ENDPOINT_A, keys: { v: 2 } });
    strict_1.default.equal(subscriptions[0].endpoint, ENDPOINT_A);
    strict_1.default.equal(typeof subscriptions[0].updatedAt, 'string');
});
(0, node_test_1.test)('savePushSubscription deletes legacy sk=userId record', async () => {
    store.set(`${'PUSH'}:${USER_ID}`, {
        pk: 'PUSH',
        sk: USER_ID,
        payload: { endpoint: 'https://legacy.example' },
    });
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_A, keys: {} });
    strict_1.default.equal(store.has(`PUSH:${USER_ID}`), false);
    strict_1.default.equal(store.has(`PUSH:${(0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A)}`), true);
});
(0, node_test_1.test)('savePushSubscription rejects missing endpoint', async () => {
    await strict_1.default.rejects(() => (0, pushSubscriptions_1.savePushSubscription)(USER_ID, {}), /missing payload\.endpoint/);
});
(0, node_test_1.test)('queryPushSubscriptions includes legacy record', async () => {
    store.set(`PUSH:${USER_ID}`, {
        pk: 'PUSH',
        sk: USER_ID,
        payload: { endpoint: 'https://legacy.example' },
    });
    const subscriptions = await (0, pushSubscriptions_1.queryPushSubscriptions)(USER_ID);
    strict_1.default.equal(subscriptions.length, 1);
    strict_1.default.equal(subscriptions[0].sk, USER_ID);
});
(0, node_test_1.test)('sendPushToSubscriptions fans out to all subscriptions', async () => {
    const subA = {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A),
        payload: { endpoint: ENDPOINT_A },
    };
    const subB = {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_B),
        payload: { endpoint: ENDPOINT_B },
    };
    const sent = [];
    await (0, pushSubscriptions_1.sendPushToSubscriptions)({ userId: USER_ID, title: 'Hi', body: 'There', topic: 'test' }, [subA, subB], async (subscription) => {
        sent.push(subscription.endpoint);
        return {};
    });
    strict_1.default.deepEqual(sent.sort(), [ENDPOINT_A, ENDPOINT_B].sort());
});
(0, node_test_1.test)('sendPushToSubscriptions deletes only stale subscription on 404/410', async () => {
    const subA = {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A),
        payload: { endpoint: ENDPOINT_A },
    };
    const subB = {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_B),
        payload: { endpoint: ENDPOINT_B },
    };
    store.set(itemKey(subA), { ...subA });
    store.set(itemKey(subB), { ...subB });
    const errors = [];
    await (0, pushSubscriptions_1.sendPushToSubscriptions)({ userId: USER_ID, title: 'Hi', body: 'There', topic: 'test' }, [subA, subB], async (subscription) => {
        if (subscription.endpoint === ENDPOINT_A) {
            const err = new Error('gone');
            err.statusCode = 410;
            throw err;
        }
        return {};
    }, (err) => errors.push(err));
    strict_1.default.equal(store.has(itemKey(subA)), false);
    strict_1.default.equal(store.has(itemKey(subB)), true);
    strict_1.default.equal(errors.length, 0);
});
(0, node_test_1.test)('sendPushToSubscriptions keeps subscription on transient errors', async () => {
    const sub = {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A),
        payload: { endpoint: ENDPOINT_A },
    };
    store.set(itemKey(sub), { ...sub });
    const errors = [];
    await (0, pushSubscriptions_1.sendPushToSubscriptions)({ userId: USER_ID, title: 'Hi', body: 'There', topic: 'test' }, [sub], async () => {
        const err = new Error('timeout');
        err.statusCode = 503;
        throw err;
    }, (err) => errors.push(err));
    strict_1.default.equal(store.has(itemKey(sub)), true);
    strict_1.default.equal(errors.length, 1);
});
(0, node_test_1.test)('deletePushSubscriptionByEndpoint removes one device and leaves others', async () => {
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_A, keys: { a: 1 } });
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_B, keys: { b: 2 } });
    await (0, pushSubscriptions_1.deletePushSubscriptionByEndpoint)(USER_ID, ENDPOINT_A);
    const subscriptions = await (0, pushSubscriptions_1.queryPushSubscriptions)(USER_ID);
    strict_1.default.equal(subscriptions.length, 1);
    strict_1.default.equal(subscriptions[0].endpoint, ENDPOINT_B);
});
(0, node_test_1.test)('deletePushSubscriptionByEndpoint is idempotent', async () => {
    await (0, pushSubscriptions_1.savePushSubscription)(USER_ID, { endpoint: ENDPOINT_A, keys: {} });
    await (0, pushSubscriptions_1.deletePushSubscriptionByEndpoint)(USER_ID, ENDPOINT_A);
    await (0, pushSubscriptions_1.deletePushSubscriptionByEndpoint)(USER_ID, ENDPOINT_A);
    const subscriptions = await (0, pushSubscriptions_1.queryPushSubscriptions)(USER_ID);
    strict_1.default.equal(subscriptions.length, 0);
});
(0, node_test_1.test)('deletePushSubscriptionByEndpoint rejects missing endpoint', async () => {
    await strict_1.default.rejects(() => (0, pushSubscriptions_1.deletePushSubscriptionByEndpoint)(USER_ID, ''), /missing endpoint/);
});
(0, node_test_1.test)('deleteAllPushSubscriptions removes new and legacy records', async () => {
    store.set(`PUSH:${USER_ID}`, {
        pk: 'PUSH',
        sk: USER_ID,
        payload: { endpoint: 'https://legacy.example' },
    });
    store.set(`PUSH:${(0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A)}`, {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_A),
        payload: { endpoint: ENDPOINT_A },
    });
    store.set(`PUSH:${(0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_B)}`, {
        pk: 'PUSH',
        sk: (0, pushSubscriptions_1.pushSortKey)(USER_ID, ENDPOINT_B),
        payload: { endpoint: ENDPOINT_B },
    });
    await (0, pushSubscriptions_1.deleteAllPushSubscriptions)(USER_ID);
    strict_1.default.equal(store.size, 0);
});
