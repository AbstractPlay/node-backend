import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  clearRecentCompletedGamesCacheForTests,
  completedGamesSinceSk,
  queryRecentCompletedGames,
  recentCompletedSinceMs,
  updateCompletedGameCommentedFlag,
} from '../lib/recentCompletedGames.js';

describe('completedGamesSinceSk', () => {
  it('uses bare epoch ms for DynamoDB lower bound', () => {
    assert.equal(completedGamesSinceSk(1_700_000_000_000), '1700000000000');
  });
});

describe('recentCompletedSinceMs', () => {
  it('subtracts whole days from now', () => {
    const now = Date.UTC(2026, 8, 9, 12, 0, 0);
    assert.equal(recentCompletedSinceMs(30, now), now - 30 * 86_400_000);
  });
});

describe('queryRecentCompletedGames', () => {
  it('paginates from cached results using offset keys', async () => {
    clearRecentCompletedGamesCacheForTests();
    const sends: unknown[] = [];
    const client = {
      send: async (command: { input?: Record<string, unknown> }) => {
        sends.push(command.input);
        return {
          Items: [
            { id: 'g3', metaGame: 'loa', lastMoveTime: 300 },
            { id: 'g2', metaGame: 'loa', lastMoveTime: 200 },
            { id: 'g1', metaGame: 'loa', lastMoveTime: 100 },
          ],
        };
      },
    } as unknown as DynamoDBDocumentClient;

    const first = await queryRecentCompletedGames(client, 'table', { days: 7, limit: 2 });
    assert.equal(first.items.length, 2);
    assert.equal(first.items[0]?.id, 'g3');
    assert.equal(first.lastEvaluatedKey, JSON.stringify({ offset: 2 }));

    const second = await queryRecentCompletedGames(client, 'table', {
      days: 7,
      limit: 2,
      exclusiveStartKey: first.lastEvaluatedKey,
    });
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0]?.id, 'g1');
    assert.equal(second.lastEvaluatedKey, undefined);
    assert.equal(sends.length, 1);
  });

  it('rejects invalid days', async () => {
    const client = { send: async () => ({ Items: [] }) } as unknown as DynamoDBDocumentClient;
    await assert.rejects(
      () => queryRecentCompletedGames(client, 'table', { days: 0 }),
      /days must be a positive number/,
    );
  });
});

describe('updateCompletedGameCommentedFlag', () => {
  it('updates global and metaGame completed rows', async () => {
    const keys: Array<{ pk: string; sk: string }> = [];
    const client = {
      send: async (command: { input?: { Key?: { pk: string; sk: string } } }) => {
        if (command.input?.Key) {
          keys.push(command.input.Key);
        }
      },
    } as unknown as DynamoDBDocumentClient;

    await updateCompletedGameCommentedFlag(client, 'table', 'loa', 'g1', 123, 2);
    assert.deepEqual(keys, [
      { pk: 'COMPLETEDGAMES', sk: '123#g1' },
      { pk: 'COMPLETEDGAMES#loa', sk: '123#g1' },
    ]);
  });
});
