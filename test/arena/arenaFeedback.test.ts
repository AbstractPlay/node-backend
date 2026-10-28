import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

const send = vi.fn();

vi.mock('../../lib/ddb.js', () => ({
  ddbDocClient: { send: (...args: unknown[]) => send(...args) },
}));

describe('submitArenaFeedback', () => {
  beforeEach(() => {
    send.mockReset();
    process.env.ABSTRACT_PLAY_TABLE = 'abstract-play-test';
  });

  it('rejects before game ends', async () => {
    send.mockResolvedValueOnce({
      Item: {
        playMode: 'arena',
        id: 'g1',
        metaGame: 'hex',
        arenaTcId: 'blitz_5_3',
        players: [{ id: 'u1' }, { id: 'u2' }],
      },
    });
    const { submitArenaFeedback } = await import('../../lib/arena/submitArenaFeedback.js');
    const res = await submitArenaFeedback('u1', validPars());
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body as string).message).toMatch(/after the game ends/i);
  });

  it('writes feedback for seated player after end', async () => {
    send
      .mockResolvedValueOnce({
        Item: {
          playMode: 'arena',
          id: 'g1',
          metaGame: 'hex',
          arenaTcId: 'blitz_5_3',
          gameEnded: 1,
          players: [{ id: 'u1' }, { id: 'u2' }],
        },
      })
      .mockResolvedValueOnce({});
    const { submitArenaFeedback } = await import('../../lib/arena/submitArenaFeedback.js');
    const res = await submitArenaFeedback('u1', validPars());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.ok).toBe(true);
    const put = send.mock.calls[1]![0];
    expect(put.input.Item.pk).toBe('ARENAFB#u1');
    expect(put.input.Item.sk).toBe('hex#g1');
    expect(put.input.Item.tier).toBe('blitz');
  });

  it('returns duplicate on second submit', async () => {
    send
      .mockResolvedValueOnce({
        Item: {
          playMode: 'arena',
          id: 'g1',
          metaGame: 'hex',
          arenaTcId: 'blitz_5_3',
          gameEnded: 1,
          players: [{ id: 'u1' }, { id: 'u2' }],
        },
      })
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));
    const { submitArenaFeedback } = await import('../../lib/arena/submitArenaFeedback.js');
    const res = await submitArenaFeedback('u1', validPars());
    const body = JSON.parse(res.body as string);
    expect(body.duplicate).toBe(true);
  });
});

function validPars() {
  return {
    metaGame: 'hex',
    gameId: 'g1',
    clockFairness: 4,
    responsiveness: 5,
    tcFit: 4,
    unfairFlag: 'na',
    queueAgain: 'yes',
  };
}
