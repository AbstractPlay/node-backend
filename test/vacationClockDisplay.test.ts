import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { enrichClockGameSlice } from '../lib/vacation/clockDisplay.js';

const T0 = Date.parse('2026-06-15T12:00:00.000Z');
const HOUR = 3_600_000;

describe('vacation clockDisplay', () => {
  it('adds effective remaining and pause flag for on-clock player', () => {
    const game = {
      players: [
        { id: 'p0', name: 'A', time: 60_000 },
        { id: 'p1', name: 'B', time: 60_000 },
      ],
      toMove: '0',
      lastMoveTime: T0,
    };
    const enriched = enrichClockGameSlice(game, T0 + 10_000, () => ({
      pauseStart: T0,
      pauseEnd: T0 + HOUR,
    }));
    assert.equal(enriched.clockDisplayServerTime, T0 + 10_000);
    assert.equal(enriched.players[0]!.effectiveRemainingMs, 60_000);
    assert.equal(enriched.players[0]!.clockPaused, true);
    assert.equal(enriched.players[1]!.effectiveRemainingMs, undefined);
  });

  it('subtracts vacation overlap from effective remaining', () => {
    const game = {
      players: [{ id: 'p0', name: 'A', time: 60_000 }],
      toMove: '0',
      lastMoveTime: T0,
    };
    const enriched = enrichClockGameSlice(game, T0 + 30_000, () => null);
    assert.equal(enriched.players[0]!.effectiveRemainingMs, 30_000);
    assert.equal(enriched.players[0]!.clockPaused, false);
  });

  it('sets onVacation for off-clock player from flags', () => {
    const game = {
      players: [
        { id: 'p0', name: 'A', time: 60_000 },
        { id: 'p1', name: 'B', time: 60_000 },
      ],
      toMove: '0',
      lastMoveTime: T0,
    };
    const enriched = enrichClockGameSlice(
      game,
      T0 + 10_000,
      () => null,
      (id) =>
        id === 'p1'
          ? { onVacation: true, vacationScheduled: false }
          : { onVacation: false, vacationScheduled: false },
    );
    assert.equal(enriched.players[1]!.onVacation, true);
    assert.equal(enriched.players[1]!.effectiveRemainingMs, undefined);
    assert.equal(enriched.players[0]!.onVacation, false);
  });
});
