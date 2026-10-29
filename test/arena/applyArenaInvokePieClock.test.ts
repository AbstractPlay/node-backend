import { describe, expect, it } from 'vitest';
import {
  applyArenaInvokePieClock,
  refundArenaPieOpponentThinkTime,
} from '../../lib/arena/applyArenaInvokePieClock.js';

const tc = { startSec: 300, incSec: 3, maxSec: 300 };

describe('applyArenaInvokePieClock', () => {
  it('debits invoker with arena Fischer increment (ms), not correspondence hours', () => {
    const prevLast = 1_000_000;
    const moveReceivedAt = prevLast + 10_000;
    const { players, timeUsedMs } = applyArenaInvokePieClock({
      moveReceivedAt,
      prevLastMoveTime: prevLast,
      invokerId: 'a',
      players: [
        { id: 'a', time: 300_000 },
        { id: 'b', time: 300_000 },
      ],
      toMove: '0',
      arenaClock: tc,
    });
    expect(timeUsedMs).toBe(10_000);
    expect(players[0]!.time).toBe(300_000 - 10_000 + 3_000);
    expect(players[1]!.time).toBe(300_000);
  });

  it('refunds opponent think time for non–pie-even parity', () => {
    const prevLast = 0;
    const moveReceivedAt = 8_000;
    const { players, timeUsedMs } = applyArenaInvokePieClock({
      moveReceivedAt,
      prevLastMoveTime: prevLast,
      invokerId: 'a',
      players: [
        { id: 'a', time: 300_000 },
        { id: 'b', time: 290_000 },
      ],
      toMove: '0',
      arenaClock: tc,
    });
    const refunded = refundArenaPieOpponentThinkTime(
      players,
      'b',
      timeUsedMs,
      tc,
    );
    expect(refunded[1]!.time).toBe(290_000 + 8_000);
  });

  it('keeps each player bank on their record when seats are reversed', () => {
    const prevLast = 100;
    const moveReceivedAt = 5_100;
    const { players } = applyArenaInvokePieClock({
      moveReceivedAt,
      prevLastMoveTime: prevLast,
      invokerId: 'a',
      players: [
        { id: 'a', time: 200_000 },
        { id: 'b', time: 280_000 },
      ],
      toMove: '0',
      arenaClock: tc,
    });
    const swapped = [...players].reverse();
    const aAfter = swapped.find((p) => p.id === 'a')!;
    const bAfter = swapped.find((p) => p.id === 'b')!;
    expect(aAfter.time).toBe(200_000 - 5_000 + 3_000);
    expect(bAfter.time).toBe(280_000);
  });
});
