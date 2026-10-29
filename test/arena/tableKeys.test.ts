import { describe, expect, it } from 'vitest';
import { arenaIndexSk } from '../../lib/arena/table/keys.js';
import { indexStateForTable } from '../../lib/arena/table/indexSync.js';
import type { ArenaTableRecord } from '../../lib/arena/table/types.js';
import { ARENA_TABLE_PK } from '../../lib/arena/table/constants.js';

describe('arena table keys', () => {
  it('arenaIndexSk inverts time for descending sort', () => {
    const older = arenaIndexSk(1_000, 'same-id');
    const newer = arenaIndexSk(2_000, 'same-id');
    expect(newer < older).toBe(true);
  });
});

describe('indexStateForTable', () => {
  const base: ArenaTableRecord = {
    pk: ARENA_TABLE_PK,
    sk: 'tid',
    tableId: 'tid',
    state: 'open',
    indexState: 'waiting',
    metaGame: 'hex',
    variants: [],
    arenaTcId: 'blitz_5_3',
    arenaClock: { startSec: 300, incSec: 3, maxSec: 300 },
    open: true,
    hostId: 'h',
    seats: [
      { userId: 'h', seatIndex: 0, ready: false },
      { userId: '', seatIndex: 1, ready: false },
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  it('returns seated when two users present', () => {
    const t = {
      ...base,
      state: 'seated' as const,
      seats: [
        { userId: 'a', seatIndex: 0 as const, ready: false },
        { userId: 'b', seatIndex: 1 as const, ready: false },
      ],
    };
    expect(indexStateForTable(t)).toBe('seated');
  });

  it('returns playing when state is playing', () => {
    expect(indexStateForTable({ ...base, state: 'playing' })).toBe('playing');
  });
});
