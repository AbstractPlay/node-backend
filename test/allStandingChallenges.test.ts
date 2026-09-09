import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  clearAllStandingChallengesCacheForTests,
  filterStandingChallengesForBlockedIssuers,
  listMetaGamesWithStandingChallenges,
  queryAllStandingChallenges,
} from '../lib/allStandingChallenges.js';

describe('filterStandingChallengesForBlockedIssuers', () => {
  it('removes challenges from blocked issuers', () => {
    const items = [
      { metaGame: 'loa', challenger: { id: 'a' } },
      { metaGame: 'go', challenger: { id: 'b' } },
    ];
    const filtered = filterStandingChallengesForBlockedIssuers(items, ['b']);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.challenger?.id, 'a');
  });
});

describe('listMetaGamesWithStandingChallenges', () => {
  it('returns only metaGames whose counts are greater than zero', async () => {
    const client = {
      send: async (command: { input?: Record<string, unknown> }) => {
        const keys = ((command.input?.RequestItems as Record<string, { Keys?: Array<{ pk: string }> }>) ?? {})
          .table?.Keys ?? [];
        return {
          Responses: {
            table: keys.map((key) => {
              const metaGame = key.pk.replace('METAGAMES#', '');
              return {
                pk: key.pk,
                sk: 'COUNTS',
                standingchallenges: metaGame === 'loa' ? 2 : 0,
              };
            }),
          },
        };
      },
    } as unknown as DynamoDBDocumentClient;

    const active = await listMetaGamesWithStandingChallenges(client, 'table');
    assert.ok(active.includes('loa'));
    assert.ok(!active.includes('go'));
  });
});

describe('queryAllStandingChallenges', () => {
  it('queries only active metaGames and applies blocked filter', async () => {
    clearAllStandingChallengesCacheForTests();
    const queried: string[] = [];
    const client = {
      send: async (command: { input?: Record<string, unknown> }) => {
        const input = command.input ?? {};
        if (input.RequestItems) {
          const keys = (input.RequestItems as Record<string, { Keys?: Array<{ pk: string }> }>).table?.Keys ?? [];
          return {
            Responses: {
              table: keys.map((key) => ({
                pk: key.pk,
                sk: 'COUNTS',
                standingchallenges: key.pk === 'METAGAMES#loa' ? 1 : 0,
              })),
            },
          };
        }
        const values = input.ExpressionAttributeValues as { ':pk'?: string } | undefined;
        if (values?.[':pk']?.startsWith('STANDINGCHALLENGE#')) {
          queried.push(values[':pk']);
          return {
            Items: [{
              metaGame: values[':pk'].replace('STANDINGCHALLENGE#', ''),
              dateIssued: 100,
              challenger: { id: 'blocked-issuer' },
            }],
          };
        }
        return { Items: [] };
      },
    } as unknown as DynamoDBDocumentClient;

    const items = await queryAllStandingChallenges(client, 'table', ['blocked-issuer']);
    assert.deepEqual(queried, ['STANDINGCHALLENGE#loa']);
    assert.equal(items.length, 0);
  });
});
