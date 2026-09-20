export type MatchLegsSetting = 1 | 2;

export function normalizeMatchLegs(value: unknown): MatchLegsSetting {
  if (value === 2) {
    return 2;
  }
  return 1;
}

export function parseMatchLegsParam(value: unknown): MatchLegsSetting | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === 1 || value === 2) {
    return value;
  }
  return undefined;
}

export function validateMatchLegsParam(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === 1 || value === 2) {
    return undefined;
  }
  return 'matchLegs must be 1 or 2';
}

/** `TOURNAMENTSCOUNTER` sk: single-leg series keep the legacy key; two-leg appends `#2`. */
export function tournamentSeriesCounterSk(
  metaGame: string,
  variants: string[],
  matchLegs?: unknown,
): string {
  const variantsKey = [...variants].sort().join('|');
  const base = `${metaGame}#${variantsKey}`;
  if (normalizeMatchLegs(matchLegs) === 2) {
    return `${base}#2`;
  }
  return base;
}
