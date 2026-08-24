import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { adminDeleteGame, loadGameForAdminDelete } from '../lib/adminDeleteGame';

type Store = Map<string, Record<string, unknown>>;

function storeKey(pk: string, sk: string): string {
  return `${pk}:${sk}`;
}

function makeStoreClient(store: Store): DynamoDBDocumentClient {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const input = command.input;
      if (command.constructor.name === 'GetCommand') {
        const key = input.Key as { pk: string; sk: string };
        const item = store.get(storeKey(key.pk, key.sk));
        return { Item: item ? { ...item } : undefined };
      }
      if (command.constructor.name === 'QueryCommand') {
        const pk = (input.ExpressionAttributeValues as Record<string, string>)[':pk'];
        const items = [...store.values()].filter(item => item.pk === pk);
        return { Items: items.map(item => ({ ...item })) };
      }
      if (command.constructor.name === 'DeleteCommand') {
        const key = input.Key as { pk: string; sk: string };
        store.delete(storeKey(key.pk, key.sk));
        return {};
      }
      if (command.constructor.name === 'BatchWriteCommand') {
        const table = Object.keys(input.RequestItems as object)[0]!;
        const requests = (input.RequestItems as Record<string, { DeleteRequest: { Key: { pk: string; sk: string } } }[]>)[table];
        for (const request of requests) {
          const key = request.DeleteRequest.Key;
          store.delete(storeKey(key.pk, key.sk));
        }
        return {};
      }
      if (command.constructor.name === 'UpdateCommand') {
        const key = input.Key as { pk: string; sk: string };
        const existing = store.get(storeKey(key.pk, key.sk)) ?? { pk: key.pk, sk: key.sk };
        const values = input.ExpressionAttributeValues as Record<string, number>;
        if (input.UpdateExpression && String(input.UpdateExpression).includes('currentgames')) {
          existing.currentgames = (existing.currentgames as number ?? 0) + (values[':cg'] ?? 0);
        }
        store.set(storeKey(key.pk, key.sk), existing);
        return {};
      }
      throw new Error(`Unhandled command ${command.constructor.name}`);
    },
  } as unknown as DynamoDBDocumentClient;
}

const TABLE = 'test-table';
const META = 'saltire';
const GAME_ID = 'game-1';
const P1 = 'player-1';
const P2 = 'player-2';
const WATCHER = 'watcher-1';

function seedActiveGame(store: Store) {
  store.set(storeKey('GAME', `${META}#0#${GAME_ID}`), {
    pk: 'GAME',
    sk: `${META}#0#${GAME_ID}`,
    id: GAME_ID,
    metaGame: META,
    numPlayers: 2,
    players: [{ id: P1, name: 'A' }, { id: P2, name: 'B' }],
    clockHard: true,
    toMove: '0',
    lastMoveTime: 100,
    state: '{}',
  });
  store.set(storeKey(`CURRENTGAMES#${P1}`, GAME_ID), {
    pk: `CURRENTGAMES#${P1}`,
    sk: GAME_ID,
    id: GAME_ID,
    metaGame: META,
  });
  store.set(storeKey(`CURRENTGAMES#${P2}`, GAME_ID), {
    pk: `CURRENTGAMES#${P2}`,
    sk: GAME_ID,
    id: GAME_ID,
    metaGame: META,
  });
  store.set(storeKey(`USERGAME#${P1}`, GAME_ID), {
    pk: `USERGAME#${P1}`,
    sk: GAME_ID,
    seen: 1,
  });
  store.set(storeKey(`WATCHED#${WATCHER}`, GAME_ID), {
    pk: `WATCHED#${WATCHER}`,
    sk: GAME_ID,
    id: GAME_ID,
  });
  store.set(storeKey(`GAMEWATCHERS#${GAME_ID}`, WATCHER), {
    pk: `GAMEWATCHERS#${GAME_ID}`,
    sk: WATCHER,
  });
  store.set(storeKey('NOTE', `${GAME_ID}#${P1}`), {
    pk: 'NOTE',
    sk: `${GAME_ID}#${P1}`,
    note: 'hi',
  });
  store.set(storeKey('GAMECOMMENTS', GAME_ID), {
    pk: 'GAMECOMMENTS',
    sk: GAME_ID,
    comments: [],
  });
  store.set(storeKey(`METAGAMES#${META}`, 'COUNTS'), {
    pk: `METAGAMES#${META}`,
    sk: 'COUNTS',
    currentgames: 1,
    completedgames: 0,
    standingchallenges: 0,
    stars: 0,
    ratingsCount: 0,
  });
}

describe('adminDeleteGame', () => {
  it('removes active game dashboard rows, watchers, and core records', async () => {
    const store: Store = new Map();
    seedActiveGame(store);
    const client = makeStoreClient(store);

    const result = await adminDeleteGame(client, TABLE, META, GAME_ID, 0);

    assert.equal(result.notFound, undefined);
    assert.equal(store.has(storeKey('GAME', `${META}#0#${GAME_ID}`)), false);
    assert.equal(store.has(storeKey(`CURRENTGAMES#${P1}`, GAME_ID)), false);
    assert.equal(store.has(storeKey(`USERGAME#${P1}`, GAME_ID)), false);
    assert.equal(store.has(storeKey(`WATCHED#${WATCHER}`, GAME_ID)), false);
    assert.equal(store.has(storeKey(`GAMEWATCHERS#${GAME_ID}`, WATCHER)), false);
    assert.equal(store.has(storeKey('GAMECOMMENTS', GAME_ID)), false);
    const counts = store.get(storeKey(`METAGAMES#${META}`, 'COUNTS'));
    assert.equal(counts?.currentgames, 0);
  });

  it('loadGameForAdminDelete falls back to the other cbit', async () => {
    const store: Store = new Map();
    store.set(storeKey('GAME', `${META}#1#${GAME_ID}`), {
      pk: 'GAME',
      sk: `${META}#1#${GAME_ID}`,
      id: GAME_ID,
      metaGame: META,
      numPlayers: 2,
      players: [{ id: P1, name: 'A' }],
      clockHard: false,
      toMove: '',
      lastMoveTime: 200,
      state: '{}',
      numMoves: 5,
    });
    const client = makeStoreClient(store);

    const loaded = await loadGameForAdminDelete(client, TABLE, META, GAME_ID, 0);
    assert.equal(loaded?.cbit, 1);
  });
});
