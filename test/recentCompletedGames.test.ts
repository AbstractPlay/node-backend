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
  it('returns all items in one response', async () => {
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

    const result = await queryRecentCompletedGames(client, 'table', { days: 7 });
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0]?.id, 'g3');
    assert.equal(sends.length, 1);
    assert.equal('lastEvaluatedKey' in result, false);
  });

  it('clamps days above max to the same window as 30 days', async () => {
    const sinceValues: unknown[] = [];
    const client = {
      send: async (command: { input?: { ExpressionAttributeValues?: Record<string, unknown> } }) => {
        sinceValues.push(command.input?.ExpressionAttributeValues?.[':since']);
        return { Items: [] };
      },
    } as unknown as DynamoDBDocumentClient;

    clearRecentCompletedGamesCacheForTests();
    await queryRecentCompletedGames(client, 'table', { days: 90 });
    const sinceFrom90 = sinceValues[0];

    clearRecentCompletedGamesCacheForTests();
    sinceValues.length = 0;
    await queryRecentCompletedGames(client, 'table', { days: 30 });
    const sinceFrom30 = sinceValues[0];

    assert.equal(sinceFrom90, sinceFrom30);
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
