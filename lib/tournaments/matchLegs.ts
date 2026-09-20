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
