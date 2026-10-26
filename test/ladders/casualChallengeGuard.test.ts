import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ddb.js', () => ({
  ddbDocClient: { send: vi.fn() },
}));

const { newChallenge } = await import('../../lib/challenges/authHandlers.js');

const baseChallenge = {
  metaGame: 'amazons',
  numPlayers: 2,
  seating: 'random',
  variants: [] as string[],
  challenger: { id: 'u1', name: 'Challenger' },
  challengees: [{ id: 'u2', name: 'Opponent' }],
  clockStart: 120,
  clockInc: 36,
  clockMax: 120,
  clockHard: true,
  rated: true,
};

describe('casual new_challenge ladder field guard', () => {
  it('rejects ladderId on new_challenge', async () => {
    const res = await newChallenge('u1', {
      ...baseChallenge,
      ladderId: 'ladder-abc',
    });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body as string) as { message: string };
    expect(body.message).toContain('new_ladder_challenge');
  });
});
