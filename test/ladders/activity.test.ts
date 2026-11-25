import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const { send } = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('../../lib/ddb.js', () => ({
  ddbDocClient: { send },
}));

import {
  LADDER_ACTIVITY_OUTCOMES_CAP,
  LADDER_ACTIVITY_WINDOW_DAYS,
  getLadderActivityData,
} from '../../lib/ladders/activity.js';

const TABLE = 'abstract-play-activity-test';
const LADDER_ID = 'ladder-act';
const NOW = 1_700_000_000_000;
const META = 'amazons';

describe('getLadderActivityData', () => {
  beforeEach(() => {
    send.mockReset();
    process.env.ABSTRACT_PLAY_TABLE = TABLE;
  });

  it('returns undefined when ladder missing', async () => {
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        return {};
      }
      return {};
    });
    const result = await getLadderActivityData('missing', NOW);
    expect(result).toBeUndefined();
  });

  it('splits active games and recent outcomes from one link query', async () => {
    const cutoff = NOW - LADDER_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const oldSettled = cutoff - 1000;
    const recentSettled = cutoff + 1000;

    send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk?: string; sk?: string };
        if (key.pk === 'LADDER' && key.sk === LADDER_ID) {
          return { Item: { sk: LADDER_ID, metaGame: META, id: LADDER_ID } };
        }
        return {};
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'];
        if (pk === 'LADDERGAME') {
          return {
            Items: [
              { ladderId: LADDER_ID, gameId: 'open-1', settled: false },
              {
                ladderId: LADDER_ID,
                gameId: 'done-old',
                settled: true,
                settledAt: oldSettled,
                outcome: 'win',
              },
              {
                ladderId: LADDER_ID,
                gameId: 'done-recent',
                settled: true,
                settledAt: recentSettled,
                outcome: 'win',
                playerIds: ['a', 'b'],
                playerNames: ['A', 'B'],
              },
              {
                ladderId: LADDER_ID,
                gameId: 'done-missing-snap',
                settled: true,
                settledAt: recentSettled,
              },
            ],
          };
        }
      }
      if (command instanceof BatchGetCommand) {
        return {
          Responses: {
            [TABLE]: [
              {
                id: 'open-1',
                metaGame: META,
                players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
                toMove: '0',
                lastMoveTime: 100,
                clockHard: true,
                numPlayers: 2,
              },
              {
                id: 'open-2-stale',
                metaGame: META,
                players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
                toMove: '',
                lastMoveTime: 50,
                clockHard: true,
                numPlayers: 2,
              },
            ],
          },
        };
      }
      return {};
    });

    const result = await getLadderActivityData(LADDER_ID, NOW);
    expect(result?.ladderId).toBe(LADDER_ID);
    expect(result?.windowDays).toBe(30);
    expect(result?.activeGames).toHaveLength(1);
    expect(result?.activeGames[0]?.id).toBe('open-1');
    expect(result?.outcomes).toHaveLength(2);
    expect(result?.outcomes[0]?.gameId).toBe('done-recent');
    expect(result?.outcomes[0]?.snapshotComplete).toBe(true);
    expect(result?.outcomes[1]?.snapshotComplete).toBe(false);
    expect(
      send.mock.calls.filter(c => c[0] instanceof QueryCommand && c[0].input.ExpressionAttributeValues?.[':pk'] === 'LADDERGAME'),
    ).toHaveLength(1);
  });

  it('caps outcomes at configured max', () => {
    expect(LADDER_ACTIVITY_OUTCOMES_CAP).toBe(500);
  });
});