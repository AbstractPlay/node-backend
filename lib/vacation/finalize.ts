import {
  computeStintPauseMs,
  hasVacationStint,
  remainingQuotaMs,
  shouldAutoFinalizeStint,
  stintPauseStart,
  utcQuotaYear,
} from './resolve.js';
import type { VacationUserFields } from './types.js';

export type VacationStintClearFields = {
  vacationStartsAt?: undefined;
  vacationEndsAt?: undefined;
  vacationOpenEnded?: undefined;
  vacationStintStartedAt?: undefined;
};

export type PlanFinalizeStintResult = {
  vacationPauseMsUsed: number;
  vacationQuotaYear: number;
  chargeMs: number;
  clearStintFields: true;
};

export type PlanStopVacationResult = PlanFinalizeStintResult;

export type PlanCancelScheduledResult = {
  clearStintFields: true;
};

function quotaYearForCharge(pauseStart: number): number {
  return utcQuotaYear(pauseStart);
}

function chargeMsForStint(fields: VacationUserFields, pauseStart: number, finalizeAt: number, now: number): number {
  const stintMs = computeStintPauseMs(pauseStart, finalizeAt);
  const remaining = remainingQuotaMs(fields, now);
  return Math.min(stintMs, remaining);
}

function applyChargeToUsed(fields: VacationUserFields, pauseStart: number, chargeMs: number): number {
  const year = quotaYearForCharge(pauseStart);
  const baseUsed = fields.vacationQuotaYear === year ? (fields.vacationPauseMsUsed ?? 0) : 0;
  return baseUsed + chargeMs;
}

/** Fixed end passed or open-ended quota cap hit at `now`. */
export function planFinalizeStint(
  fields: VacationUserFields,
  now: number,
): PlanFinalizeStintResult | null {
  if (!shouldAutoFinalizeStint(fields, now)) {
    return null;
  }
  const pauseStart = stintPauseStart(fields, now)!;
  let finalizeAt = now;
  if (!fields.vacationOpenEnded && fields.vacationEndsAt !== undefined) {
    finalizeAt = Math.min(now, fields.vacationEndsAt);
  } else if (fields.vacationOpenEnded) {
    const remaining = remainingQuotaMs(fields, now);
    finalizeAt = Math.min(now, pauseStart + remaining);
  }
  const chargeMs = chargeMsForStint(fields, pauseStart, finalizeAt, now);
  return {
    vacationPauseMsUsed: applyChargeToUsed(fields, pauseStart, chargeMs),
    vacationQuotaYear: quotaYearForCharge(pauseStart),
    chargeMs,
    clearStintFields: true,
  };
}

export function planStopVacation(
  fields: VacationUserFields,
  now: number,
): PlanStopVacationResult | null {
  if (!hasVacationStint(fields)) {
    return null;
  }
  const startsAt = fields.vacationStartsAt!;
  if (now < startsAt) {
    return null;
  }
  const pauseStart = fields.vacationStintStartedAt ?? startsAt;
  const chargeMs = chargeMsForStint(fields, pauseStart, now, now);
  return {
    vacationPauseMsUsed: applyChargeToUsed(fields, pauseStart, chargeMs),
    vacationQuotaYear: quotaYearForCharge(pauseStart),
    chargeMs,
    clearStintFields: true,
  };
}

export function planCancelScheduled(
  fields: VacationUserFields,
  now: number,
): PlanCancelScheduledResult | null {
  if (!hasVacationStint(fields)) {
    return null;
  }
  if (now >= fields.vacationStartsAt!) {
    return null;
  }
  return { clearStintFields: true };
}
