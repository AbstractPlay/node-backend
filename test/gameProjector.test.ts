import { describe, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import type { DynamoDBRecord } from 'aws-lambda';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  parseGameSk,
  processGameStreamRecord,
  resolveNumMoves,
  shouldKeepCompletedGame,
  toCompletedSummary,
  toCurrentSummary,
} from '../lib/gameProjector.js';

vi.mock('../lib/participants.js', () => ({
  isBotId: vi.fn(async () => false),
}));

describe('parseGameSk', () => {
  it('parses metaGame#cbit#gameId', () => {
    assert.deepEqual(parseGameSk('saltire#0#abc-123'), {
      metaGame: 'saltire',
      cbit: '0',
      gameId: 'abc-123',
    });
  });

  it('returns null for invalid sk', () => {
    assert.equal(parseGameSk('saltire#0'), null);
    assert.equal(parseGameSk(''), null);
  });
});

describe('toCurrentSummary', () => {
  it('maps active game fields including numMoves', () => {
    const summary = toCurrentSummary({
      pk: 'GAME',
      sk: 'saltire#0#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [{ id: 'p1', name: 'A' }],
      clockHard: true,
      toMove: '0',
      lastMoveTime: 100,
      state: '{}',
      variants: ['v1'],
      gameStarted: 50,
      numMoves: 12,
    });
    assert.equal(summary.id, 'g1');
    assert.equal(summary.metaGame, 'saltire');
    assert.equal(summary.noExplore, false);
    assert.deepEqual(summary.variants, ['v1']);
    assert.equal(summary.numMoves, 12);
  });
});

describe('shouldKeepCompletedGame', () => {
  it('keeps games with more moves than players', () => {
    const game = {
      pk: 'GAME',
      sk: 'saltire#1#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [],
      clockHard: false,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
    };
    assert.equal(shouldKeepCompletedGame(game, 3), true);
    assert.equal(shouldKeepCompletedGame(game, 2), false);
  });

  it('keeps 1-player games with any completed move', () => {
    const solo = {
      pk: 'GAME',
      sk: 'saltire#1#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 1,
      players: [],
      clockHard: false,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
    };
    assert.equal(shouldKeepCompletedGame(solo, 1), true);
    assert.equal(shouldKeepCompletedGame(solo, 0), false);
  });
});

describe('toCompletedSummary', () => {
  it('includes numMoves and commented', () => {
    const summary = toCompletedSummary({
      pk: 'GAME',
      sk: 'saltire#1#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [{ id: 'p1', name: 'A' }],
      clockHard: false,
      toMove: '',
      lastMoveTime: 200,
      state: '{}',
      commented: 1,
      winner: [1],
    }, 5);
    assert.equal(summary.numMoves, 5);
    assert.equal(summary.commented, 1);
    assert.deepEqual(summary.winner, [1]);
  });
});

describe('resolveNumMoves', () => {
  it('uses numMoves when present', () => {
    assert.equal(resolveNumMoves({
      pk: 'GAME',
      sk: 'x#1#y',
      id: 'y',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [],
      clockHard: false,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
      numMoves: 7,
    }), 7);
  });
});

describe('processGameStreamRecord', () => {
  it('skips completed-game inserts without a players array', async () => {
    let sendCalls = 0;
    const docClient = {
      send: async () => {
        sendCalls += 1;
      },
    } as unknown as DynamoDBDocumentClient;

    await processGameStreamRecord(docClient, 'table', {
      eventName: 'INSERT',
      dynamodb: {
        NewImage: {
          pk: { S: 'GAME' },
          sk: { S: 'volo#1#444727048' },
          tournament: { S: 'volo#7e2e487d-f028-47cb-b979-9e20972b6296' },
        },
      },
    } satisfies DynamoDBRecord);

    assert.equal(sendCalls, 0);
  });

  it('writes global and sharded completed indexes on completed insert', async () => {
    const puts: Array<{ pk?: string; sk?: string }> = [];
    const docClient = {
      send: async (command: { input?: { Item?: { pk?: string; sk?: string } } }) => {
        if (command.input?.Item) {
          puts.push(command.input.Item);
        }
      },
    } as unknown as DynamoDBDocumentClient;

    await processGameStreamRecord(docClient, 'table', {
      eventName: 'INSERT',
      dynamodb: {
        NewImage: {
          pk: { S: 'GAME' },
          sk: { S: 'loa#1#g1' },
          id: { S: 'g1' },
          metaGame: { S: 'loa' },
          numPlayers: { N: '2' },
          numMoves: { N: '3' },
          lastMoveTime: { N: '200' },
          clockHard: { BOOL: false },
          toMove: { S: '0' },
          state: { S: '{}' },
          players: {
            L: [
              { M: { id: { S: 'human-1' }, name: { S: 'A' } } },
              { M: { id: { S: 'human-2' }, name: { S: 'B' } } },
            ],
          },
        },
      },
    } satisfies DynamoDBRecord);

    assert.ok(puts.some(item => item.pk === 'COMPLETEDGAMES' && item.sk === '200#g1'));
    assert.ok(puts.some(item => item.pk === 'COMPLETEDGAMES#loa' && item.sk === '200#g1'));
    assert.ok(puts.some(item => item.pk === 'COMPLETEDGAMES#human-1' && item.sk === '200#g1'));
  });
});
