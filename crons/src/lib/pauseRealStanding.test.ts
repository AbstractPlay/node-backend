import { describe, expect, it } from 'vitest';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { pauseMatchingRealStandingEntries } from './pauseRealStanding.js';

describe('pauseMatchingRealStandingEntries', () => {
  it('suspends only matching preset entries', async () => {
    let putItem: Record<string, unknown> | undefined;
    const client = {
      async send(command: GetCommand | PutCommand) {
        if (command instanceof GetCommand) {
          return {
            Item: {
              pk: 'REALSTANDING',
              sk: 'u1',
              standing: [{
                id: 'p1',
                metaGame: 'chess',
                numPlayers: 2,
                variants: ['standard'],
                clockStart: 600,
                clockInc: 0,
                clockMax: 0,
                clockHard: false,
                rated: true,
                noExplore: false,
                limit: 1,
                sensitivity: 'variants',
                suspended: false,
              }, {
                id: 'p2',
                metaGame: 'go',
                numPlayers: 2,
                variants: [],
                clockStart: 600,
                clockInc: 0,
                clockMax: 0,
                clockHard: false,
                rated: true,
                noExplore: false,
                limit: 1,
                sensitivity: 'meta',
                suspended: false,
              }],
            },
          };
        }
        putItem = command.input.Item as Record<string, unknown>;
        return {};
      },
    } as DynamoDBDocumentClient;

    const paused = await pauseMatchingRealStandingEntries(client, 'table', 'u1', {
      metaGame: 'chess',
      numPlayers: 2,
      variants: ['standard'],
      clockStart: 600,
      clockInc: 0,
      clockMax: 0,
      clockHard: false,
      rated: true,
      noExplore: false,
    });

    expect(paused).toBe(1);
    const standing = (putItem?.standing as { id: string; suspended: boolean }[]);
    expect(standing[0]?.suspended).toBe(true);
    expect(standing[1]?.suspended).toBe(false);
  });
});
