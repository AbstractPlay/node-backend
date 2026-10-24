import { beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const TOURNAMENT_ID = 'c3174304-9e7f-464b-830c-80d90e1e3e49';
const META = 'saltire';
const TABLE = 'abstract-play-test';

const ddbSend = vi.fn();

vi.mock('../lib/ddb.js', () => ({
  ddbDocClient: { send: (...args: unknown[]) => ddbSend(...args) },
}));

vi.mock('../lib/tournaments/tournamentComments.js', () => ({
  getTournamentCommentsItem: async () => [],
}));

const { getTournament } = await import('../lib/public/tournaments.js');

type Item = Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ABSTRACT_PLAY_TABLE = TABLE;
});

test('get_tournament resolves archived tournament with metaGame when active row is missing', async () => {
  const archived: Item = {
    pk: 'COMPLETEDTOURNAMENT',
    sk: `${META}#${TOURNAMENT_ID}`,
    id: TOURNAMENT_ID,
    metaGame: META,
    divisions: { 1: { numGames: 2, numCompleted: 2, processed: true } },
    players: [{ playerid: 'p1', sk: `${TOURNAMENT_ID}#1#p1` }],
  };

  ddbSend.mockImplementation(async (command: unknown) => {
    if (command instanceof QueryCommand) {
      const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
      const sk = command.input.ExpressionAttributeValues?.[':sk'] as string | undefined;

      if (pk === 'TOURNAMENT' && sk === TOURNAMENT_ID) {
        return { Items: [] };
      }
      if (pk === 'TOURNAMENTPLAYER') {
        return { Items: [] };
      }
      if (pk === 'TOURNAMENTGAME') {
        return { Items: [] };
      }
      return { Items: [] };
    }
    if (command instanceof GetCommand) {
      const { pk, sk } = command.input.Key as { pk: string; sk: string };
      if (pk === 'COMPLETEDTOURNAMENT' && sk === `${META}#${TOURNAMENT_ID}`) {
        return { Item: archived };
      }
      return {};
    }
    if (command instanceof UpdateCommand) {
      throw new Error('unexpected update');
    }
    throw new Error(`unexpected command ${command}`);
  });

  const result = await getTournament({
    tournamentid: TOURNAMENT_ID,
    metaGame: META,
    isArchived: 'false',
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string);
  assert.equal(body.tournament[0]?.id, TOURNAMENT_ID);
  assert.equal(body.tournament[0]?.metaGame, META);
  assert.deepEqual(body.tournamentPlayers, []);
});

test('get_tournament with isArchived falls back to active TOURNAMENT row', async () => {
  const active: Item = {
    pk: 'TOURNAMENT',
    sk: TOURNAMENT_ID,
    id: TOURNAMENT_ID,
    metaGame: META,
    started: true,
    divisions: { 1: { numGames: 2, numCompleted: 0, processed: false } },
  };

  ddbSend.mockImplementation(async (command: unknown) => {
    if (command instanceof QueryCommand) {
      const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
      const sk = command.input.ExpressionAttributeValues?.[':sk'] as string | undefined;
      if (pk === 'COMPLETEDTOURNAMENT') {
        return { Items: [] };
      }
      if (pk === 'TOURNAMENT' && sk === TOURNAMENT_ID) {
        return { Items: [active] };
      }
      if (pk === 'TOURNAMENTPLAYER') {
        return { Items: [{ playerid: 'p1', sk: `${TOURNAMENT_ID}#1#p1` }] };
      }
      if (pk === 'TOURNAMENTGAME') {
        return { Items: [] };
      }
      return { Items: [] };
    }
    if (command instanceof GetCommand) {
      return {};
    }
    return {};
  });

  const result = await getTournament({
    tournamentid: TOURNAMENT_ID,
    metaGame: META,
    isArchived: 'true',
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string);
  assert.equal(body.tournament[0]?.id, TOURNAMENT_ID);
  assert.equal(body.tournamentPlayers.length, 1);
});

test('get_tournament does not scan archived partition without metaGame', async () => {
  ddbSend.mockImplementation(async (command: unknown) => {
    if (command instanceof QueryCommand) {
      const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
      if (pk === 'TOURNAMENT') {
        return { Items: [] };
      }
      return { Items: [] };
    }
    if (command instanceof GetCommand) {
      throw new Error('GetCommand should not run without metaGame');
    }
    return {};
  });

  const result = await getTournament({
    tournamentid: TOURNAMENT_ID,
    metaGame: 'undefined',
    isArchived: 'false',
  });

  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body as string);
  assert.deepEqual(body.tournament, []);
});
