import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getUsersLastSeen,
  touchUserLastSeen,
  TOUCH_USER_LAST_SEEN_INTERVAL_MS,
} from '../lib/touchUserLastSeen';

const TABLE = 'test-table';
const USER_ID = 'user-1';
const NOW = Date.parse('2026-08-24T12:00:00.000Z');

type Store = Map<string, Record<string, unknown>>;

function key(pk: string, sk: string): string {
  return `${pk}:${sk}`;
}

function makeClient(store: Store) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const input = command.input;
      if (command.constructor.name === 'UpdateCommand') {
        const itemKey = input.Key as { pk: string; sk: string };
        const item = store.get(key(itemKey.pk, itemKey.sk)) ?? {
          pk: itemKey.pk,
          sk: itemKey.sk,
        };
        const values = input.ExpressionAttributeValues as Record<string, number>;
        const touchBefore = values[':touchBefore'];
        const existing = item.lastSeen as number | undefined;
        if (existing !== undefined && existing >= touchBefore) {
          const err = new Error('conditional failed');
          (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
          throw err;
        }
        item.lastSeen = values[':now'];
        store.set(key(itemKey.pk, itemKey.sk), item);
        return {};
      }
      if (command.constructor.name === 'BatchGetCommand') {
        const requestItems = input.RequestItems as Record<string, { Keys: { pk: string; sk: string }[] }>;
        const keys = requestItems[TABLE]?.Keys ?? [];
        const items = keys
          .map(k => store.get(key(k.pk, k.sk)))
          .filter((item): item is Record<string, unknown> => item !== undefined)
          .map(item => ({ ...item }));
        return { Responses: { [TABLE]: items } };
      }
      throw new Error(`Unhandled ${command.constructor.name}`);
    },
  };
}

describe('touchUserLastSeen', () => {
  it('writes lastSeen when absent', async () => {
    const store: Store = new Map();
    const touched = await touchUserLastSeen(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      NOW,
    );
    assert.equal(touched, true);
    assert.equal((store.get(key('USERS', USER_ID)) as { lastSeen: number }).lastSeen, NOW);
  });

  it('skips when lastSeen is recent', async () => {
    const store: Store = new Map([
      [key('USERS', USER_ID), {
        pk: 'USERS',
        sk: USER_ID,
        lastSeen: NOW - 1000,
      }],
    ]);
    const touched = await touchUserLastSeen(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      NOW,
    );
    assert.equal(touched, false);
    assert.equal((store.get(key('USERS', USER_ID)) as { lastSeen: number }).lastSeen, NOW - 1000);
  });

  it('writes when lastSeen is older than touch interval', async () => {
    const store: Store = new Map([
      [key('USERS', USER_ID), {
        pk: 'USERS',
        sk: USER_ID,
        lastSeen: NOW - TOUCH_USER_LAST_SEEN_INTERVAL_MS - 1,
      }],
    ]);
    const touched = await touchUserLastSeen(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      NOW,
    );
    assert.equal(touched, true);
    assert.equal((store.get(key('USERS', USER_ID)) as { lastSeen: number }).lastSeen, NOW);
  });
});

describe('getUsersLastSeen', () => {
  it('returns lastSeen values for requested users', async () => {
    const store: Store = new Map([
      [key('USERS', 'u1'), { pk: 'USERS', sk: 'u1', lastSeen: 100 }],
      [key('USERS', 'u2'), { pk: 'USERS', sk: 'u2' }],
    ]);
    const map = await getUsersLastSeen(makeClient(store) as never, TABLE, ['u1', 'u2', 'u1']);
    assert.equal(map.get('u1'), 100);
    assert.equal(map.get('u2'), undefined);
  });
});
