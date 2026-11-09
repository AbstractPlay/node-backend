import { utcQuotaYear } from './resolve.js';
import type { VacationClockStint, VacationUserFields } from './types.js';
import type { VacationWindow } from './types.js';

const MAX_CLOCK_STINTS_KEPT = 64;

export function vacationClockStintsFromItem(
  item: Record<string, unknown>,
): VacationClockStint[] {
  const raw = item.vacationClockStints;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: VacationClockStint[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const pauseStart = rec.pauseStart;
    const pauseEnd = rec.pauseEnd;
    if (typeof pauseStart === 'number' && typeof pauseEnd === 'number' && pauseEnd > pauseStart) {
      out.push({ pauseStart, pauseEnd });
    }
  }
  return out;
}

export function vacationClockStintDynamoValue(stints: VacationClockStint[]): VacationClockStint[] {
  return stints.map(s => ({ pauseStart: s.pauseStart, pauseEnd: s.pauseEnd }));
}

/** Append a ended stint for clock overlap; prune by UTC quota year and cap length. */
export function appendVacationClockStint(
  fields: VacationUserFields,
  pauseStart: number,
  pauseEnd: number,
  now: number,
): VacationClockStint[] {
  if (pauseEnd <= pauseStart) {
    return fields.vacationClockStints ?? [];
  }
  const year = utcQuotaYear(now);
  const yearStart = Date.UTC(year, 0, 1);
  const prev = fields.vacationClockStints ?? [];
  const next = [...prev, { pauseStart, pauseEnd }];
  const pruned = next
    .filter(s => s.pauseEnd > yearStart)
    .slice(-MAX_CLOCK_STINTS_KEPT);
  return pruned;
}

export function endedStintsToWindows(stints: VacationClockStint[]): VacationWindow[] {
  return stints.map(s => ({ pauseStart: s.pauseStart, pauseEnd: s.pauseEnd }));
}
