import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  __setDocClientForTests,
  deleteAllPushSubscriptions,
  pushSortKey,
  pushSubscriptionKey,
  queryPushSubscriptions,
  savePushSubscription,
  sendPushToSubscriptions,
  type PushCredentials,
} from '../lib/pushSubscriptions';

const TABLE = 'abstract-play-test';
const USER_ID = 'user-123';
const ENDPOINT_A = 'https://push.example/a';
const ENDPOINT_B = 'https://push.example/b';

type Item = Record<string, unknown>;

function itemKey(item: Item): string {
  return `${item.pk}:${item.sk}`;
}

function createMockDocClient(store: Map<string, Item>) {
  return {
    async send(command: PutCommand | GetCommand | QueryCommand | DeleteCommand) {
      if (command instanceof PutCommand) {
        const item = command.input.Item as Item;
        store.set(itemKey(item), { ...item });
        return {};
      }
      if (command instanceof GetCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        const item = store.get(`${pk}:${sk}`);
        return { Item: item };
      }
      if (command instanceof DeleteCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        store.delete(`${pk}:${sk}`);
        return {};
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
        const skPrefix = command.input.ExpressionAttributeValues?.[':skPrefix'] as string;
        const items = [...store.values()].filter((item) => {
          const sk = item.sk as string;
          return item.pk === pk && sk.startsWith(skPrefix);
        });
        return { Items: items };
      }
      throw new Error('Unsupported command');
    },
  };
}

let store: Map<string, Item>;

beforeEach(() => {
  store = new Map();
  process.env.ABSTRACT_PLAY_TABLE = TABLE;
  process.env.VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  __setDocClientForTests(createMockDocClient(store) as any);
});

afterEach(() => {
  __setDocClientForTests(undefined);
});

test('pushSubscriptionKey is stable and 16 hex chars', () => {
  const key = pushSubscriptionKey(ENDPOINT_A);
  assert.equal(key, pushSubscriptionKey(ENDPOINT_A));
  assert.match(key, /^[0-9a-f]{16}$/);
});

test('pushSortKey combines user id and endpoint hash', () => {
  assert.equal(pushSortKey(USER_ID, ENDPOINT_A), `${USER_ID}#${pushSubscriptionKey(ENDPOINT_A)}`);
});

test('savePushSubscription creates distinct records for different endpoints', async () => {
  await savePushSubscription(USER_ID, { endpoint: ENDPOINT_A, keys: { a: 1 } });
  await savePushSubscription(USER_ID, { endpoint: ENDPOINT_B, keys: { b: 2 } });

  const subscriptions = await queryPushSubscriptions(USER_ID);
  assert.equal(subscriptions.length, 2);
  assert.equal(subscriptions[0].sk, pushSortKey(USER_ID, ENDPOINT_A));
  assert.equal(subscriptions[1].sk, pushSortKey(USER_ID, ENDPOINT_B));
});

test('savePushSubscription upserts the same endpoint', async () => {
  await savePushSubscription(USER_ID, { endpoint: ENDPOINT_A, keys: { v: 1 } });
  await savePushSubscription(USER_ID, { endpoint: ENDPOINT_A, keys: { v: 2 } });

  const subscriptions = await queryPushSubscriptions(USER_ID);
  assert.equal(subscriptions.length, 1);
  assert.deepEqual(subscriptions[0].payload, { endpoint: ENDPOINT_A, keys: { v: 2 } });
  assert.equal(subscriptions[0].endpoint, ENDPOINT_A);
  assert.equal(typeof subscriptions[0].updatedAt, 'string');
});

test('savePushSubscription deletes legacy sk=userId record', async () => {
  store.set(`${'PUSH'}:${USER_ID}`, {
    pk: 'PUSH',
    sk: USER_ID,
    payload: { endpoint: 'https://legacy.example' },
  });

  await savePushSubscription(USER_ID, { endpoint: ENDPOINT_A, keys: {} });

  assert.equal(store.has(`PUSH:${USER_ID}`), false);
  assert.equal(store.has(`PUSH:${pushSortKey(USER_ID, ENDPOINT_A)}`), true);
});

test('savePushSubscription rejects missing endpoint', async () => {
  await assert.rejects(
    () => savePushSubscription(USER_ID, {}),
    /missing payload\.endpoint/
  );
});

test('queryPushSubscriptions includes legacy record', async () => {
  store.set(`PUSH:${USER_ID}`, {
    pk: 'PUSH',
    sk: USER_ID,
    payload: { endpoint: 'https://legacy.example' },
  });

  const subscriptions = await queryPushSubscriptions(USER_ID);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].sk, USER_ID);
});

test('sendPushToSubscriptions fans out to all subscriptions', async () => {
  const subA: PushCredentials = {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_A),
    payload: { endpoint: ENDPOINT_A },
  };
  const subB: PushCredentials = {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_B),
    payload: { endpoint: ENDPOINT_B },
  };
  const sent: string[] = [];
  await sendPushToSubscriptions(
    { userId: USER_ID, title: 'Hi', body: 'There', topic: 'test' },
    [subA, subB],
    async (subscription) => {
      sent.push(subscription.endpoint);
      return {};
    }
  );

  assert.deepEqual(sent.sort(), [ENDPOINT_A, ENDPOINT_B].sort());
});

test('sendPushToSubscriptions deletes only stale subscription on 404/410', async () => {
  const subA: PushCredentials = {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_A),
    payload: { endpoint: ENDPOINT_A },
  };
  const subB: PushCredentials = {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_B),
    payload: { endpoint: ENDPOINT_B },
  };
  store.set(itemKey(subA), { ...subA });
  store.set(itemKey(subB), { ...subB });

  const errors: unknown[] = [];
  await sendPushToSubscriptions(
    { userId: USER_ID, title: 'Hi', body: 'There', topic: 'test' },
    [subA, subB],
    async (subscription) => {
      if (subscription.endpoint === ENDPOINT_A) {
        const err = new Error('gone') as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
      return {};
    },
    (err) => errors.push(err)
  );

  assert.equal(store.has(itemKey(subA)), false);
  assert.equal(store.has(itemKey(subB)), true);
  assert.equal(errors.length, 0);
});

test('sendPushToSubscriptions keeps subscription on transient errors', async () => {
  const sub: PushCredentials = {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_A),
    payload: { endpoint: ENDPOINT_A },
  };
  store.set(itemKey(sub), { ...sub });

  const errors: unknown[] = [];
  await sendPushToSubscriptions(
    { userId: USER_ID, title: 'Hi', body: 'There', topic: 'test' },
    [sub],
    async () => {
      const err = new Error('timeout') as Error & { statusCode: number };
      err.statusCode = 503;
      throw err;
    },
    (err) => errors.push(err)
  );

  assert.equal(store.has(itemKey(sub)), true);
  assert.equal(errors.length, 1);
});

test('deleteAllPushSubscriptions removes new and legacy records', async () => {
  store.set(`PUSH:${USER_ID}`, {
    pk: 'PUSH',
    sk: USER_ID,
    payload: { endpoint: 'https://legacy.example' },
  });
  store.set(`PUSH:${pushSortKey(USER_ID, ENDPOINT_A)}`, {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_A),
    payload: { endpoint: ENDPOINT_A },
  });
  store.set(`PUSH:${pushSortKey(USER_ID, ENDPOINT_B)}`, {
    pk: 'PUSH',
    sk: pushSortKey(USER_ID, ENDPOINT_B),
    payload: { endpoint: ENDPOINT_B },
  });

  await deleteAllPushSubscriptions(USER_ID);

  assert.equal(store.size, 0);
});
