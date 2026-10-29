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

  it('uses wall now as tick origin when countdown not scheduled', () => {
    const now = 500_000;
    assert.equal(arenaClockTickOrigin({ ...base }, now), now);
  });
});
