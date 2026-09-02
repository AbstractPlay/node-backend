import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  checkInGameCommentAuth,
  gameRecordSk,
  isGameParticipant,
} from '../lib/commentAuth.js';

const TABLE = 'abstract-play-test';
const META = 'emu';
const GAME_ID = 'd70ccde2-3c93-4ad5-b71f-f5c8f6015500';
const PLAYER_A = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const PLAYER_B = '5448f4f8-90d1-70c3-1cb9-3ad42904e413';
const SPECTATOR = 'a82c4aa8-7d43-4661-b027-17afd1d1586f';
const ADMIN = 'admin-user-id';

type Item = Record<string, unknown>;

function itemKey(item: Item): string {
  return `${item.pk}:${item.sk}`;
}

function activeGame(players: { id: string; name: string }[]): Item {
  return {
    pk: 'GAME',
    sk: gameRecordSk(META, 0, GAME_ID),
    id: GAME_ID,
    metaGame: META,
    players,
  };
}

function completedGame(players: { id: string; name: string }[]): Item {
  return {
    pk: 'GAME',
    sk: gameRecordSk(META, 1, GAME_ID),
    id: GAME_ID,
    metaGame: META,
    players,
  };
}

function userRecord(id: string, admin: boolean): Item {
  return {
    pk: 'USER',
    sk: id,
    id,
    admin,
  };
}

function createMockDocClient(store: Map<string, Item>) {
  return {
    async send(command: GetCommand) {
      if (command instanceof GetCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        const item = store.get(`${pk}:${sk}`);
        return { Item: item };
      }
      throw new Error('Unsupported command');
    },
  };
}

let store: Map<string, Item>;
let client: ReturnType<typeof createMockDocClient>;

beforeEach(() => {
  store = new Map();
  client = createMockDocClient(store);
});

afterEach(() => {
  store.clear();
});

test('gameRecordSk formats active and completed keys', () => {
  assert.equal(gameRecordSk('emu', 0, 'abc'), 'emu#0#abc');
  assert.equal(gameRecordSk('emu', 1, 'abc'), 'emu#1#abc');
});

test('isGameParticipant matches player ids', () => {
  const game = { players: [{ id: PLAYER_A }, { id: PLAYER_B }] };
  assert.equal(isGameParticipant(game, PLAYER_A), true);
  assert.equal(isGameParticipant(game, SPECTATOR), false);
});

test('empty userid skips auth (system messages)', async () => {
  const result = await checkInGameCommentAuth(client as any, TABLE, '', META, GAME_ID);
  assert.deepEqual(result, { ok: true });
});

test('participant on active game is allowed', async () => {
  store.set(itemKey(activeGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ])), activeGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ]));

  const result = await checkInGameCommentAuth(client as any, TABLE, PLAYER_A, META, GAME_ID);
  assert.deepEqual(result, { ok: true });
});

test('non-participant non-admin on active game is denied (Chris attack scenario)', async () => {
  store.set(itemKey(activeGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ])), activeGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ]));
  store.set(itemKey(userRecord(SPECTATOR, false)), userRecord(SPECTATOR, false));

  const result = await checkInGameCommentAuth(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /participants and admins/);
  }
});

test('admin non-participant on active game is allowed', async () => {
  store.set(itemKey(activeGame([{ id: PLAYER_A, name: 'mason' }])), activeGame([{ id: PLAYER_A, name: 'mason' }]));
  store.set(itemKey(userRecord(ADMIN, true)), userRecord(ADMIN, true));

  const result = await checkInGameCommentAuth(client as any, TABLE, ADMIN, META, GAME_ID);
  assert.deepEqual(result, { ok: true });
});

test('missing game record is denied', async () => {
  const result = await checkInGameCommentAuth(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /not found/i);
  }
});

test('completed game only (#1#) is denied for submit_comment', async () => {
  store.set(itemKey(completedGame([{ id: PLAYER_A, name: 'mason' }])), completedGame([{ id: PLAYER_A, name: 'mason' }]));

  const result = await checkInGameCommentAuth(client as any, TABLE, PLAYER_A, META, GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /save_exploration/);
  }
});

test('wrong metaGame with no matching record is denied', async () => {
  store.set(itemKey(activeGame([{ id: PLAYER_A, name: 'mason' }])), activeGame([{ id: PLAYER_A, name: 'mason' }]));

  const result = await checkInGameCommentAuth(client as any, TABLE, PLAYER_A, 'wrong-meta', GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /not found/i);
  }
});
