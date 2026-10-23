import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  findCompletedTournament,
  isConcreteMetaGame,
} from '../lib/tournaments/completedTournamentLookup.js';

const TABLE = 'abstract-play-test';
const TOURNAMENT_ID = 'c3174304-9e7f-464b-830c-80d90e1e3e49';
const META = 'saltire';

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
        const needle = command.input.ExpressionAttributeValues?.[':needle'] as string | undefined;
        const items: Item[] = [];
        for (const item of store.values()) {
          if (item.pk !== pk) {
            continue;
          }
          const sk = item.sk as string;
          if (needle !== undefined && !sk.includes(needle)) {
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

test('isConcreteMetaGame rejects placeholder undefined metaGame', () => {
  assert.equal(isConcreteMetaGame(undefined), false);
  assert.equal(isConcreteMetaGame(''), false);
  assert.equal(isConcreteMetaGame('undefined'), false);
  assert.equal(isConcreteMetaGame(META), true);
});

test('findCompletedTournament loads by metaGame key', async () => {
  const row = {
    pk: 'COMPLETEDTOURNAMENT',
    sk: `${META}#${TOURNAMENT_ID}`,
    id: TOURNAMENT_ID,
    metaGame: META,
    divisions: { 1: { numGames: 2, numCompleted: 2, processed: true } },
  };
  store.set(itemKey(row), row);
  const found = await findCompletedTournament(
    client as never,
    TABLE,
    TOURNAMENT_ID,
    META,
  );
  assert.equal(found?.id, TOURNAMENT_ID);
});

test('findCompletedTournament resolves id-only archived tournament', async () => {
  const row = {
    pk: 'COMPLETEDTOURNAMENT',
    sk: `${META}#${TOURNAMENT_ID}`,
    id: TOURNAMENT_ID,
    metaGame: META,
  };
  store.set(itemKey(row), row);
  const found = await findCompletedTournament(
    client as never,
    TABLE,
    TOURNAMENT_ID,
  );
  assert.equal(found?.metaGame, META);
});
