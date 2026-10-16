import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  deleteTournamentForUser,
  listCurrentTournamentRefsForUser,
  putCurrentTournamentForUser,
  tournamentByUserPk,
  tournamentByUserSk,
} from '../lib/tournaments/byUserIndex.js';

const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const TOURNAMENT_A = 'd70ccde2-3c93-4ad5-b71f-f5c8f6015500';
const TOURNAMENT_B = 'e81ddfe3-4d04-5be6-c82e-6d9e0f712661';

type Item = Record<string, unknown>;

function itemKey(item: Item): string {
  return `${item.pk}:${item.sk}`;
}

function createMockDocClient(store: Map<string, Item>) {
  return {
    async send(command: PutCommand | DeleteCommand | QueryCommand) {
      if (command instanceof PutCommand) {
        const item = command.input.Item as Item;
        store.set(itemKey(item), { ...item });
        return {};
      }
      if (command instanceof DeleteCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        store.delete(`${pk}:${sk}`);
        return {};
      }
      if (command instanceof QueryCommand) {
        const pk = (command.input.ExpressionAttributeValues as Record<string, string>)[':pk'];
        const items = [...store.values()].filter(item => item.pk === pk);
        return { Items: items };
      }
      throw new Error('Unsupported command');
    },
  } as unknown as DynamoDBDocumentClient;
}

describe('tournamentByUser key helpers', () => {
  it('builds pk and sk', () => {
    assert.equal(tournamentByUserPk(USER_ID), `TOURNAMENTBYUSER#${USER_ID}`);
    assert.equal(tournamentByUserSk(TOURNAMENT_A), TOURNAMENT_A);
  });
});

describe('putCurrentTournamentForUser', () => {
  it('writes pk/sk with optional division and metaGame', async () => {
    const store = new Map<string, Item>();
    const client = createMockDocClient(store);

    await putCurrentTournamentForUser(client, TABLE, {
      userId: USER_ID,
      tournamentId: TOURNAMENT_A,
      division: 2,
      metaGame: 'loa',
    });

    const key = `${tournamentByUserPk(USER_ID)}:${TOURNAMENT_A}`;
    const item = store.get(key);
    assert.ok(item);
    assert.equal(item.pk, `TOURNAMENTBYUSER#${USER_ID}`);
    assert.equal(item.sk, TOURNAMENT_A);
    assert.equal(item.division, 2);
    assert.equal(item.metaGame, 'loa');
  });

  it('omits optional attributes when not provided', async () => {
    const store = new Map<string, Item>();
    const client = createMockDocClient(store);

    await putCurrentTournamentForUser(client, TABLE, {
      userId: USER_ID,
      tournamentId: TOURNAMENT_A,
    });

    const item = store.get(`${tournamentByUserPk(USER_ID)}:${TOURNAMENT_A}`);
    assert.ok(item);
    assert.equal('division' in item, false);
    assert.equal('metaGame' in item, false);
  });
});

describe('deleteTournamentForUser', () => {
  it('removes the index row', async () => {
    const store = new Map<string, Item>();
    const client = createMockDocClient(store);
    const key = `${tournamentByUserPk(USER_ID)}:${TOURNAMENT_A}`;
    store.set(key, {
      pk: tournamentByUserPk(USER_ID),
      sk: TOURNAMENT_A,
    });

    await deleteTournamentForUser(client, TABLE, USER_ID, TOURNAMENT_A);
    assert.equal(store.has(key), false);
  });
});

describe('listCurrentTournamentRefsForUser', () => {
  it('returns refs for the user partition only', async () => {
    const store = new Map<string, Item>();
    const client = createMockDocClient(store);
    store.set(`${tournamentByUserPk(USER_ID)}:${TOURNAMENT_A}`, {
      pk: tournamentByUserPk(USER_ID),
      sk: TOURNAMENT_A,
      division: 1,
      metaGame: 'go',
    });
    store.set(`${tournamentByUserPk(USER_ID)}:${TOURNAMENT_B}`, {
      pk: tournamentByUserPk(USER_ID),
      sk: TOURNAMENT_B,
    });
    store.set(`${tournamentByUserPk('other-user')}:${TOURNAMENT_A}`, {
      pk: tournamentByUserPk('other-user'),
      sk: TOURNAMENT_A,
    });

    const refs = await listCurrentTournamentRefsForUser(client, TABLE, USER_ID);
    assert.equal(refs.length, 2);
    const a = refs.find(r => r.tournamentId === TOURNAMENT_A);
    const b = refs.find(r => r.tournamentId === TOURNAMENT_B);
    assert.deepEqual(a, { tournamentId: TOURNAMENT_A, division: 1, metaGame: 'go' });
    assert.deepEqual(b, { tournamentId: TOURNAMENT_B });
  });
});
