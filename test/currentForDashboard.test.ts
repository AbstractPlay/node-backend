import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resolveCurrentTournamentsForDashboard } from '../lib/tournaments/currentForDashboard.js';

const TABLE = 'abstract-play-test';
const USER_ID = '3ccb3a1f-3d25-441e-9efc-e526eac4fe9a';
const TOURNAMENT_ID = 'eea164c6-c343-4931-8b42-5ef412cf2a35';

function createMockClient(store: Map<string, Record<string, unknown>>) {
  return {
    async send(command: { constructor: { name: string }; input?: Record<string, unknown> }) {
      const name = command.constructor.name;
      if (name === 'QueryCommand') {
        const input = command.input ?? {};
        const values = input.ExpressionAttributeValues as Record<string, string>;
        const pk = values[':pk'];
        const skPrefix = values[':sk'];
        const items = [...store.values()].filter((item) => {
          if (item.pk !== pk) {
            return false;
          }
          if (skPrefix !== undefined) {
            return String(item.sk).startsWith(skPrefix);
          }
          return true;
        });
        return { Items: items };
      }
      if (name === 'BatchGetCommand') {
        const requestItems = command.input?.RequestItems as Record<string, { Keys?: Array<{ pk: string; sk: string }> }>;
        const keys = requestItems?.[TABLE]?.Keys ?? [];
        const responses = keys
          .map(key => store.get(`${key.pk}:${key.sk}`))
          .filter((item): item is Record<string, unknown> => item !== undefined);
        return { Responses: { [TABLE]: responses } };
      }
      throw new Error(`Unsupported command ${name}`);
    },
  } as unknown as DynamoDBDocumentClient;
}

describe('resolveCurrentTournamentsForDashboard', () => {
  it('returns empty array when user has no index rows', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const client = createMockClient(store);
    const result = await resolveCurrentTournamentsForDashboard(client, TABLE, USER_ID);
    assert.deepEqual(result, []);
  });

  it('filters ended tournaments and builds player list from division rows', async () => {
    const store = new Map<string, Record<string, unknown>>();
    store.set(`TOURNAMENTBYUSER#${USER_ID}:${TOURNAMENT_ID}`, {
      pk: `TOURNAMENTBYUSER#${USER_ID}`,
      sk: TOURNAMENT_ID,
      division: 1,
      metaGame: 'mirador',
    });
    store.set(`TOURNAMENT:${TOURNAMENT_ID}`, {
      pk: 'TOURNAMENT',
      sk: TOURNAMENT_ID,
      metaGame: 'mirador',
      variants: [],
      number: 1,
      started: true,
      dateStarted: 1_700_000_000_000,
      divisions: { '1': { numGames: 6, numCompleted: 0, processed: false } },
    });
    store.set(`TOURNAMENT:ended-tid`, {
      pk: 'TOURNAMENT',
      sk: 'ended-tid',
      metaGame: 'go',
      started: true,
      dateEnded: 2,
      number: 2,
      divisions: {},
    });
    store.set(`TOURNAMENTBYUSER#${USER_ID}:ended-tid`, {
      pk: `TOURNAMENTBYUSER#${USER_ID}`,
      sk: 'ended-tid',
    });
    store.set(`TOURNAMENTPLAYER:${TOURNAMENT_ID}#1#${USER_ID}`, {
      pk: 'TOURNAMENTPLAYER',
      sk: `${TOURNAMENT_ID}#1#${USER_ID}`,
      playerid: USER_ID,
      division: 1,
    });
    store.set(`TOURNAMENTPLAYER:${TOURNAMENT_ID}#1#other`, {
      pk: 'TOURNAMENTPLAYER',
      sk: `${TOURNAMENT_ID}#1#other-player`,
      playerid: 'other-player',
      division: 1,
    });
    store.set(`TOURNAMENTPLAYER:${TOURNAMENT_ID}#1#signup-only`, {
      pk: 'TOURNAMENTPLAYER',
      sk: `${TOURNAMENT_ID}#1#signup-only`,
      playerid: 'signup-only',
    });

    const client = createMockClient(store);
    const result = await resolveCurrentTournamentsForDashboard(client, TABLE, USER_ID);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, TOURNAMENT_ID);
    assert.equal(result[0]?.metaGame, 'mirador');
    assert.deepEqual(result[0]?.players.sort(), [USER_ID, 'other-player'].sort());
    assert.deepEqual(result[0]?.divisions, { '1': { numGames: 6, numCompleted: 0, processed: false } });
  });
});
