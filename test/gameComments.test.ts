import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  hasInterestingUserGameComments,
  isUserChatComment,
  sanitizeInGameCommentedFlags,
} from '../lib/gameComments.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('isUserChatComment', () => {
  it('rejects system pie lines', () => {
    assert.equal(isUserChatComment(''), false);
    assert.equal(isUserChatComment('  '), false);
    assert.equal(isUserChatComment('user-1'), true);
  });

  it('treats missing userId as system', () => {
    assert.equal(isUserChatComment(undefined), false);
    assert.equal(isUserChatComment(null), false);
  });
});

describe('hasInterestingUserGameComments', () => {
  it('ignores malformed comment rows', () => {
    assert.equal(
      hasInterestingUserGameComments([
        { userId: undefined as unknown as string, comment: 'hello' },
        { userId: 'u1', comment: undefined as unknown as string },
      ]),
      false,
    );
  });

  it('ignores pie-only GAMECOMMENTS', () => {
    const pieOnly = [
      {
        userId: '',
        comment:
          'ganelon elected to switch seats. As a result, the game record for ply 1 has been retroactively changed.',
        timeStamp: 1,
      },
    ];
    assert.equal(hasInterestingUserGameComments(pieOnly), false);

    const withPlayer = [
      ...pieOnly,
      { userId: 'u1', comment: 'Interesting analysis here for sure', timeStamp: 2 },
    ];
    assert.equal(hasInterestingUserGameComments(withPlayer), true);
  });
});

describe('sanitizeInGameCommentedFlags', () => {
  it('clears commented without throwing when GAMECOMMENTS rows are malformed', async () => {
    const games = [{ id: 'g1', commented: 1 as number }];
    const client = {
      send: async () => ({
        Responses: {
          table: [{
            sk: 'g1',
            comments: { not: 'an array' },
          }],
        },
      }),
    } as unknown as DynamoDBDocumentClient;

    await sanitizeInGameCommentedFlags(client, 'table', games);
    assert.equal(games[0].commented, 0);
  });

  it('dedupes GAMECOMMENTS batch keys when completed index has duplicate game ids', async () => {
    const games = [
      { id: 'g1', commented: 1 as number },
      { id: 'g1', commented: 1 as number },
    ];
    let batchKeyCount = 0;
    const client = {
      send: async (cmd: { input?: { RequestItems?: Record<string, { Keys?: unknown[] }> } }) => {
        const keys = cmd.input?.RequestItems?.table?.Keys ?? [];
        batchKeyCount = keys.length;
        return {
          Responses: {
            table: [{ sk: 'g1', comments: [] }],
          },
        };
      },
    } as unknown as DynamoDBDocumentClient;

    await sanitizeInGameCommentedFlags(client, 'table', games);
    assert.equal(batchKeyCount, 1);
    assert.equal(games[0].commented, 0);
    assert.equal(games[1].commented, 0);
  });

  it('skips batch get when completed summary rows lack id', async () => {
    const games = [{ id: '', commented: 1 as number }];
    let sendCalls = 0;
    const client = {
      send: async () => {
        sendCalls += 1;
        return { Responses: { table: [] } };
      },
    } as unknown as DynamoDBDocumentClient;

    await sanitizeInGameCommentedFlags(client, 'table', games);
    assert.equal(sendCalls, 0);
    assert.equal(games[0].commented, 1);
  });
});
