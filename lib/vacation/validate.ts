import type { VacationUserFields, VacationValidationError } from './types.js';
import {
  hasVacationStint,
  isVacationScheduled,
  remainingQuotaMs,
  stintPauseStart,
} from './resolve.js';

export type ScheduleVacationInput = {
  startsAt: number;
  endsAt?: number | null;
  openEnded: boolean;
  fields: VacationUserFields;
  now: number;
};

export type UpdateVacationInput = {
  startsAt?: number;
  endsAt?: number | null;
  openEnded?: boolean;
  fields: VacationUserFields;
  now: number;
};

function requiredStintMs(startsAt: number, endsAt: number): number {
  return Math.max(0, endsAt - startsAt);
}

function hasBlockingStint(fields: VacationUserFields): boolean {
  return hasVacationStint(fields);
}

export function validateSchedule(input: ScheduleVacationInput): VacationValidationError | null {
  const { fields, now, openEnded } = input;
  if (hasBlockingStint(fields)) {
    return 'vacation_stint_active';
  }
  const startsAt = input.startsAt;
  if (startsAt <= 0) {
    return 'vacation_invalid_range';
  }
  if (openEnded) {
    if (input.endsAt != null) {
      return 'vacation_invalid_range';
    }
    const effectiveStart = Math.max(startsAt, now);
    if (remainingQuotaMs(fields, now) <= 0) {
      return 'vacation_no_quota';
    }
    if (startsAt < now - 1000) {
      return 'vacation_invalid_range';
    }
    return null;
  }
  const endsAt = input.endsAt;
  if (endsAt == null || endsAt === undefined) {
    return 'vacation_invalid_range';
  }
  if (endsAt <= startsAt) {
    return 'vacation_invalid_range';
  }
  if (endsAt <= now) {
    return 'vacation_ends_in_past';
  }
  const need = requiredStintMs(Math.max(startsAt, now), endsAt);
  if (need > remainingQuotaMs(fields, now)) {
    return 'vacation_no_quota';
  }
  return null;
}

export function validateUpdate(input: UpdateVacationInput): VacationValidationError | null {
  const { fields, now } = input;
  if (!hasVacationStint(fields)) {
    return 'vacation_not_scheduled';
  }
  const openEnded = input.openEnded ?? fields.vacationOpenEnded === true;
  const startsAt = input.startsAt ?? fields.vacationStartsAt!;
  if (input.startsAt !== undefined && now >= fields.vacationStartsAt!) {
    return 'vacation_invalid_range';
  }
  if (openEnded) {
    if (input.endsAt != null) {
      return 'vacation_invalid_range';
    }
    if (remainingQuotaMs(fields, now) <= 0 && stintPauseStart(fields, now) === null) {
      return 'vacation_no_quota';
    }
    return null;
  }
  const endsAt = input.endsAt ?? fields.vacationEndsAt;
  if (endsAt == null) {
    return 'vacation_invalid_range';
  }
  if (now >= endsAt) {
    return 'vacation_end_passed';
  }
  if (endsAt <= startsAt) {
    return 'vacation_invalid_range';
  }
  const effectiveStart = Math.max(startsAt, fields.vacationStintStartedAt ?? startsAt, now);
  if (requiredStintMs(effectiveStart, endsAt) > remainingQuotaMs(fields, now)) {
    return 'vacation_no_quota';
  }
  return null;
}

export function validateStop(
  fields: VacationUserFields,
  now: number,
): VacationValidationError | null {
  if (!hasVacationStint(fields)) {
    return 'vacation_nothing_to_stop';
  }
  if (isVacationScheduled(fields, now)) {
    return null;
  }
  if (stintPauseStart(fields, now) !== null) {
    return null;
  }
  return 'vacation_nothing_to_stop';
}
