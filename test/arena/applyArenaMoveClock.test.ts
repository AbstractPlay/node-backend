import { describe, expect, it } from 'vitest';
import { applyArenaMoveClock } from '../../lib/arena/applyArenaMoveClock.js';

const tc = { startSec: 300, incSec: 3, maxSec: 300 };

describe('applyArenaMoveClock', () => {
  it('debits submitter and adds one increment for human ply', () => {
    const prevLast = 1_000_000;
    const moveReceivedAt = prevLast + 10_000;
    const result = applyArenaMoveClock({
      moveReceivedAt,
      prevLastMoveTime: prevLast,
      submitterId: 'a',
      players: [
        { id: 'a', time: 300_000 },
        { id: 'b', time: 300_000 },
      ],
      toMoveAfterMove: '1',
      arenaClock: tc,
      autoMovesPerPlayer: [0, 0],
    });
    expect(result.lastMoveTime).toBe(moveReceivedAt);
    expect(result.players[0]!.time).toBe(300_000 - 10_000 + 3_000);
    expect(result.players[1]!.time).toBe(300_000);
  });

  it('adds automove increments without debiting non-submitters', () => {
    const prevLast = 0;
    const moveReceivedAt = 5_000;
    const arenaClock = { startSec: 300, incSec: 3, maxSec: 600 };
    const result = applyArenaMoveClock({
      moveReceivedAt,
      prevLastMoveTime: prevLast,
      submitterId: 'a',
      players: [
        { id: 'a', time: 300_000 },
        { id: 'b', time: 300_000 },
      ],
      toMoveAfterMove: '0',
      arenaClock,
      autoMovesPerPlayer: [1, 1],
    });
    expect(result.players[0]!.time).toBe(300_000 - 5_000 + 3_000 + 1 * 3_000);
    expect(result.players[1]!.time).toBe(300_000 + 1 * 3_000);
  });
});
