/** Division counters on `TOURNAMENT.divisions.*` (matches authHandlers / starttournaments). */
export type DivisionProgress = {
  numGames: number;
  numCompleted: number;
  processed: boolean;
};

/** Scheduled round-robin (or two-leg) count is met or exceeded on the counter. */
export function divisionPlayScheduleComplete(division: DivisionProgress): boolean {
  return division.numGames > 0 && division.numCompleted >= division.numGames;
}

/** Standings / `dateEnded` processing still needed for this division. */
export function divisionNeedsStandingsProcessing(division: DivisionProgress): boolean {
  return divisionPlayScheduleComplete(division) && !division.processed;
}

export function tournamentDivisionReadyForFinalization(
  divisions: Record<string, DivisionProgress> | undefined,
): boolean {
  if (divisions === undefined) {
    return false;
  }
  return Object.values(divisions).some(divisionNeedsStandingsProcessing);
}
