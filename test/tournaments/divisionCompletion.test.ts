import { describe, expect, it } from 'vitest';
import {
  divisionNeedsStandingsProcessing,
  divisionPlayScheduleComplete,
  tournamentDivisionReadyForFinalization,
} from '../../lib/tournaments/divisionCompletion.js';

describe('divisionCompletion', () => {
  it('treats schedule complete at exact and over-complete counters', () => {
    expect(divisionPlayScheduleComplete({ numGames: 15, numCompleted: 15, processed: false })).toBe(true);
    expect(divisionPlayScheduleComplete({ numGames: 15, numCompleted: 16, processed: false })).toBe(true);
    expect(divisionPlayScheduleComplete({ numGames: 15, numCompleted: 14, processed: false })).toBe(false);
  });

  it('needs standings when complete and not processed', () => {
    expect(divisionNeedsStandingsProcessing({ numGames: 15, numCompleted: 16, processed: false })).toBe(true);
    expect(divisionNeedsStandingsProcessing({ numGames: 15, numCompleted: 16, processed: true })).toBe(false);
  });

  it('detects tournament-level finalization readiness', () => {
    expect(tournamentDivisionReadyForFinalization({
      1: { numGames: 6, numCompleted: 5, processed: false },
    })).toBe(false);
    expect(tournamentDivisionReadyForFinalization({
      1: { numGames: 15, numCompleted: 16, processed: false },
    })).toBe(true);
  });
});
