import { describe, expect, it } from 'vitest';
import { snapshotToMove, toMoveSeatChanged } from '../lib/games/toMoveSeat.js';

describe('toMoveSeatChanged', () => {
  it('returns false when next is empty', () => {
    expect(toMoveSeatChanged('0', '')).toBe(false);
    expect(toMoveSeatChanged('0', null)).toBe(false);
  });

  it('detects turn seat change for correspondence games', () => {
    expect(toMoveSeatChanged('0', '1')).toBe(true);
    expect(toMoveSeatChanged('1', '1')).toBe(false);
  });

  it('detects simultaneous seat bitmap changes', () => {
    expect(toMoveSeatChanged([true, false], [true, true])).toBe(true);
    expect(toMoveSeatChanged([true, true], [true, true])).toBe(false);
  });
});

describe('snapshotToMove', () => {
  it('copies simultaneous arrays', () => {
    const src = [true, false];
    const snap = snapshotToMove(src);
    expect(snap).toEqual(src);
    expect(snap).not.toBe(src);
  });
});