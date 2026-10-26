import { describe, expect, it, vi, beforeEach } from 'vitest';

const { send } = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('../../lib/ddb.js', () => ({
  ddbDocClient: { send },
}));

import { applyLadderGameEnd } from '../../lib/ladders/applyLadderGameEnd.js';

describe('applyLadderGameEnd', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('no-ops when LADDERGAME already settled', async () => {
    send.mockResolvedValueOnce({
      Item: { ladderId: 'L1', gameId: 'G1', settled: true },
    });
    await applyLadderGameEnd({
      id: 'G1',
      ladderId: 'L1',
      metaGame: 'amazons',
      winner: [1],
      players: [{ id: 'u1' }, { id: 'u2' }],
      rated: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips when rated is false', async () => {
    await applyLadderGameEnd({
      id: 'G1',
      ladderId: 'L1',
      metaGame: 'amazons',
      winner: [1],
      players: [{ id: 'u1' }, { id: 'u2' }],
      rated: false,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
