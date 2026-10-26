import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ladderPlayerFixture, ladderRecordFixture } from '../fixtures/ladders.js';

const getLadderRecord = vi.hoisted(() => vi.fn());
const getLadderPlayer = vi.hoisted(() => vi.fn());

vi.mock('../../lib/ladders/ladderStore.js', () => ({
  getLadderRecord,
  getLadderPlayer,
  queryLadderPlayers: vi.fn(async () => []),
}));

const { joinLadderPool } = await import('../../lib/ladders/pool.js');

const LADDER_ID = 'l1';
const TABLE = 'test-table';

describe('joinLadderPool cap gate', () => {
  beforeEach(() => {
    getLadderRecord.mockReset();
    getLadderPlayer.mockReset();
    process.env.ABSTRACT_PLAY_TABLE = TABLE;
    getLadderRecord.mockResolvedValue(ladderRecordFixture(LADDER_ID, { status: 'active' }));
  });

  it('rejects when caller is at concurrent ladder game cap', async () => {
    getLadderPlayer.mockResolvedValue(ladderPlayerFixture('u1', LADDER_ID, {
      activeLadderGameCount: 7,
    }));
    const result = await joinLadderPool(
      { send: vi.fn() } as never,
      TABLE,
      LADDER_ID,
      'u1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('maximum');
    }
  });
});
