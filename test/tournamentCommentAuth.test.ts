import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  checkTournamentCommentAuth,
  isTournamentParticipant,
  listTournamentParticipantIds,
} from '../lib/tournaments/tournamentCommentAuth.js';

const TABLE = 'abstract-play-test';
const TOURNAMENT_ID = 'tour-uuid-1';
const META = 'go';
const PLAYER = 'player-a';
const SPECTATOR = 'spectator-x';
const ADMIN = 'admin-user';

type Item = Record<string, unknown>;

function itemKey(item: Item): string {
  return `${item.pk}:${item.sk}`;
}

function createMockDocClient(store: Map<string, Item>) {
  return {
    async send(command: GetCommand | QueryCommand) {
      if (command instanceof GetCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        const item = store.get(`${pk}:${sk}`);
        return { Item: item };
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
        const skPrefix = command.input.ExpressionAttributeValues?.[':sk'] as string | undefined;
        const items: Item[] = [];
        for (const item of store.values()) {
          if (item.pk !== pk) {
            continue;
          }
          const sk = item.sk as string;
          if (skPrefix !== undefined && !sk.startsWith(skPrefix)) {
            continue;
          }
          items.push(item);
        }
        return { Items: items };
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

test('isTournamentParticipant matches id list', () => {
  assert.equal(isTournamentParticipant([PLAYER, 'other'], PLAYER), true);
  assert.equal(isTournamentParticipant([PLAYER], SPECTATOR), false);
});

test('listTournamentParticipantIds reads TOURNAMENTPLAYER rows', async () => {
  store.set(itemKey({
    pk: 'TOURNAMENTPLAYER',
    sk: `${TOURNAMENT_ID}#1#${PLAYER}`,
    playerid: PLAYER,
  }), {
    pk: 'TOURNAMENTPLAYER',
    sk: `${TOURNAMENT_ID}#1#${PLAYER}`,
    playerid: PLAYER,
  });
  const ids = await listTournamentParticipantIds(
    client as never,
    TABLE,
    TOURNAMENT_ID,
  );
  assert.deepEqual(ids, [PLAYER]);
});

test('listTournamentParticipantIds falls back to completed tournament players', async () => {
  store.set(itemKey({
    pk: 'COMPLETEDTOURNAMENT',
    sk: `${META}#${TOURNAMENT_ID}`,
    players: [{ playerid: PLAYER, sk: `${TOURNAMENT_ID}#1#${PLAYER}` }],
  }), {
    pk: 'COMPLETEDTOURNAMENT',
    sk: `${META}#${TOURNAMENT_ID}`,
    players: [{ playerid: PLAYER, sk: `${TOURNAMENT_ID}#1#${PLAYER}` }],
  });
  const ids = await listTournamentParticipantIds(
    client as never,
    TABLE,
    TOURNAMENT_ID,
    META,
  );
  assert.deepEqual(ids, [PLAYER]);
});

test('checkTournamentCommentAuth allows participant', async () => {
  store.set(itemKey({
    pk: 'TOURNAMENTPLAYER',
    sk: `${TOURNAMENT_ID}#1#${PLAYER}`,
    playerid: PLAYER,
  }), {
    pk: 'TOURNAMENTPLAYER',
    sk: `${TOURNAMENT_ID}#1#${PLAYER}`,
    playerid: PLAYER,
  });
  store.set(itemKey({ pk: 'TOURNAMENT', sk: TOURNAMENT_ID }), {
    pk: 'TOURNAMENT',
    sk: TOURNAMENT_ID,
  });
  const result = await checkTournamentCommentAuth(
    client as never,
    TABLE,
    PLAYER,
    TOURNAMENT_ID,
  );
  assert.deepEqual(result, { ok: true });
});

test('checkTournamentCommentAuth allows admin', async () => {
  store.set(itemKey({ pk: 'USER', sk: ADMIN }), {
    pk: 'USER',
    sk: ADMIN,
    admin: true,
  });
  store.set(itemKey({ pk: 'TOURNAMENT', sk: TOURNAMENT_ID }), {
    pk: 'TOURNAMENT',
    sk: TOURNAMENT_ID,
  });
  const result = await checkTournamentCommentAuth(
    client as never,
    TABLE,
    ADMIN,
    TOURNAMENT_ID,
  );
  assert.deepEqual(result, { ok: true });
});

test('checkTournamentCommentAuth rejects spectator', async () => {
  store.set(itemKey({ pk: 'TOURNAMENT', sk: TOURNAMENT_ID }), {
    pk: 'TOURNAMENT',
    sk: TOURNAMENT_ID,
  });
  const result = await checkTournamentCommentAuth(
    client as never,
    TABLE,
    SPECTATOR,
    TOURNAMENT_ID,
  );
  assert.equal(result.ok, false);
});
