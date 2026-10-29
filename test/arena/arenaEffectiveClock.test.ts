import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  arenaClockSliceForElapsed,
  arenaClockTickOrigin,
  isArenaCompetitiveClockLive,
} from '../../lib/arena/arenaEffectiveClock.js';

describe('arenaEffectiveClock', () => {
  const base = {
    players: [{ id: 'a', time: 60_000 }, { id: 'b', time: 60_000 }],
    toMove: '0',
    lastMoveTime: 0,
  };

  it('is not live before arenaClockStartAt', () => {
    const startAt = 1_000_000;
    assert.equal(
      isArenaCompetitiveClockLive({ arenaClockStartAt: startAt }, startAt - 1),
      false,
    );
    assert.equal(
      isArenaCompetitiveClockLive({ arenaClockStartAt: startAt }, startAt),
      true,
    );
  });

  it('freezes elapsed time before countdown ends', () => {
    const startAt = 1_000_000;
    const now = 999_000;
    const slice = arenaClockSliceForElapsed(
      { ...base, arenaClockStartAt: startAt },
      now,
    );
    assert.equal(slice.lastMoveTime, startAt);
    assert.equal(arenaClockTickOrigin({ ...base, arenaClockStartAt: startAt }, now), startAt);
  });

  it('uses persisted lastMoveTime when synchronized start is not scheduled', () => {
    const now = 500_000;
    const game = { ...base, lastMoveTime: 123_456 };
    assert.equal(arenaClockTickOrigin(game, now), 123_456);
  });

  it('uses lastMoveTime after synchronized start (not arenaClockStartAt)', () => {
    const startAt = 1_000_000;
    const lastMove = 1_050_000;
    const now = 1_060_000;
    const game = { ...base, arenaClockStartAt: startAt, lastMoveTime: lastMove };
    assert.equal(arenaClockTickOrigin(game, now), lastMove);
    assert.equal(arenaClockSliceForElapsed(game, now).lastMoveTime, lastMove);
  });
});
