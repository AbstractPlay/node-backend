import { describe, expect, it } from 'vitest';
import {
  parseArenaFlagPayload,
  shouldSkipArenaFlagWorker,
} from '../../lib/arena/flagPayload.js';
import {
  arenaFlagScheduleName,
  arenaSchedulerGroupName,
  computeArenaFlagScheduleAtMs,
  formatSchedulerAtExpression,
  resolveArenaFlagScheduleAtMs,
  ARENA_FLAG_SCHEDULE_MIN_LEAD_MS,
} from '../../lib/arena/flagSchedule.js';
import { ARENA_CLOCK_GRACE_MS } from '../../lib/arena/constants.js';

describe('arena flag payload', () => {
  it('parses valid payload', () => {
    expect(parseArenaFlagPayload({
      metaGame: 'amazons',
      gameId: 'abc-123',
      clockGeneration: 2,
    })).toEqual({
      metaGame: 'amazons',
      gameId: 'abc-123',
      clockGeneration: 2,
    });
  });

  it('rejects invalid payload', () => {
    expect(parseArenaFlagPayload(null)).toBeNull();
    expect(parseArenaFlagPayload({ metaGame: 'x' })).toBeNull();
  });

  it('no-ops stale clockGeneration', () => {
    const payload = {
      metaGame: 'amazons',
      gameId: 'g1',
      clockGeneration: 1,
    };
    expect(shouldSkipArenaFlagWorker(payload, { clockGeneration: 2 })).toEqual({
      skip: true,
      reason: 'stale_generation',
    });
    expect(shouldSkipArenaFlagWorker(payload, { clockGeneration: 1 })).toEqual({
      skip: false,
    });
    expect(shouldSkipArenaFlagWorker(payload, null)).toEqual({
      skip: true,
      reason: 'game_not_found',
    });
  });
});

describe('arena flag schedule helpers', () => {
  it('names group and schedule per stage/game', () => {
    expect(arenaSchedulerGroupName('dev')).toBe('abstractplay-arena-dev');
    expect(arenaFlagScheduleName('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('arena-flag-550e8400-e29b-41d4-a716-446655440000');
  });

  it('arms at nominal flag plus grace', () => {
    expect(computeArenaFlagScheduleAtMs(1_000_000, 750)).toBe(1_000_750);
    expect(computeArenaFlagScheduleAtMs(1_000_000)).toBe(1_000_000 + ARENA_CLOCK_GRACE_MS);
  });

  it('formats UTC at() expression', () => {
    const ms = Date.parse('2026-10-28T18:00:00.000Z');
    expect(formatSchedulerAtExpression(ms)).toBe('at(2026-10-28T18:00:00)');
  });

  it('re-arms overdue flags in the near future, not in the past', () => {
    const nominal = 1_000_000;
    const now = 1_000_000 + ARENA_CLOCK_GRACE_MS + 21_000;
    expect(resolveArenaFlagScheduleAtMs(nominal, ARENA_CLOCK_GRACE_MS, now)).toBe(
      now + ARENA_FLAG_SCHEDULE_MIN_LEAD_MS,
    );
    const futureNominal = now + 60_000;
    expect(resolveArenaFlagScheduleAtMs(futureNominal, ARENA_CLOCK_GRACE_MS, now)).toBe(
      futureNominal + ARENA_CLOCK_GRACE_MS,
    );
  });
});
