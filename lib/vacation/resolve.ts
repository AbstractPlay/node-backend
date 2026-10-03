import { VACATION_BLOCK_MS, VACATION_QUOTA_MS } from './constants.js';
import type { VacationSnapshot, VacationUserFields, VacationWindow } from './types.js';

export function utcQuotaYear(now: number): number {
  return new Date(now).getUTCFullYear();
}

export function normalizedPauseMsUsed(fields: VacationUserFields, now: number): number {
  const year = utcQuotaYear(now);
  if (fields.vacationQuotaYear === undefined || fields.vacationQuotaYear !== year) {
    return 0;
  }
  return fields.vacationPauseMsUsed ?? 0;
}

export function remainingQuotaMs(fields: VacationUserFields, now: number): number {
  const used = normalizedPauseMsUsed(fields, now);
  return Math.max(0, VACATION_QUOTA_MS - used);
}

export function hasVacationStint(fields: VacationUserFields): boolean {
  return fields.vacationStartsAt !== undefined && fields.vacationStartsAt !== null;
}

export function stintPauseStart(fields: VacationUserFields, now: number): number | null {
  if (!hasVacationStint(fields)) {
    return null;
  }
  const startsAt = fields.vacationStartsAt!;
  if (now < startsAt) {
    return null;
  }
  return fields.vacationStintStartedAt ?? startsAt;
}

/** End of pause interval (exclusive cap for open-ended quota). Null if not pausing at `now`. */
export function stintPauseEnd(fields: VacationUserFields, now: number, pauseStart: number): number | null {
  const remaining = remainingQuotaMs(fields, now);
  if (fields.vacationOpenEnded) {
    const cap = pauseStart + remaining;
    if (remaining <= 0 || now >= cap) {
      return null;
    }
    return cap;
  }
  const endsAt = fields.vacationEndsAt;
  if (endsAt === undefined || endsAt === null) {
    return null;
  }
  if (now >= endsAt) {
    return null;
  }
  return endsAt;
}

export function resolveVacationWindow(fields: VacationUserFields, now: number): VacationWindow | null {
  const pauseStart = stintPauseStart(fields, now);
  if (pauseStart === null) {
    return null;
  }
  const pauseEnd = stintPauseEnd(fields, now, pauseStart);
  if (pauseEnd === null || pauseStart >= pauseEnd) {
    return null;
  }
  if (now < pauseStart || now >= pauseEnd) {
    return null;
  }
  return { pauseStart, pauseEnd };
}

export function isVacationActive(fields: VacationUserFields, now: number): boolean {
  return resolveVacationWindow(fields, now) !== null;
}

export function isVacationScheduled(fields: VacationUserFields, now: number): boolean {
  if (!hasVacationStint(fields)) {
    return false;
  }
  return now < fields.vacationStartsAt!;
}

export function computeStintPauseMs(stintStartedAt: number, finalizeAt: number): number {
  return Math.max(0, finalizeAt - stintStartedAt);
}

/** Stint should be finalized (fixed end passed or open-ended quota cap reached). */
export function shouldAutoFinalizeStint(fields: VacationUserFields, now: number): boolean {
  const pauseStart = stintPauseStart(fields, now);
  if (pauseStart === null) {
    return false;
  }
  if (fields.vacationOpenEnded) {
    const remaining = remainingQuotaMs(fields, now);
    return remaining <= 0 || now >= pauseStart + remaining;
  }
  const endsAt = fields.vacationEndsAt;
  return endsAt !== undefined && endsAt !== null && now >= endsAt;
}

export function buildVacationSnapshot(fields: VacationUserFields, now: number): VacationSnapshot {
  const year = utcQuotaYear(now);
  const used = normalizedPauseMsUsed(fields, now);
  const remaining = remainingQuotaMs(fields, now);
  return {
    vacationPauseMsUsed: used,
    vacationQuotaMsRemaining: remaining,
    vacationBlocksRemaining: remaining / VACATION_BLOCK_MS,
    vacationQuotaYear: year,
    vacationStartsAt: fields.vacationStartsAt,
    vacationEndsAt: fields.vacationEndsAt,
    vacationOpenEnded: fields.vacationOpenEnded === true,
    vacationActive: isVacationActive(fields, now),
    vacationScheduled: isVacationScheduled(fields, now),
  };
}
