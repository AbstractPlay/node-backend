/** Fischer-style hard clock for automated tournaments (hours). */
export const AUTOMATED_TOURNAMENT_CLOCK_INC = 36;
export const AUTOMATED_TOURNAMENT_CLOCK_MAX = 120;
/** New games start at the cap, not a lower base time. */
export const AUTOMATED_TOURNAMENT_CLOCK_START = AUTOMATED_TOURNAMENT_CLOCK_MAX;

const MS_PER_HOUR = 3_600_000;

export function tournamentBankMsFromHours(hours: number): number {
  return hours * MS_PER_HOUR;
}

export function tournamentInitialBankMs(
  clockMaxHours: number = AUTOMATED_TOURNAMENT_CLOCK_MAX,
): number {
  return tournamentBankMsFromHours(clockMaxHours);
}
