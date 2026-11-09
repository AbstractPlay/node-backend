export type VacationClockStint = {
  pauseStart: number;
  pauseEnd: number;
};

export type VacationUserFields = {
  vacationQuotaYear?: number;
  vacationPauseMsUsed?: number;
  vacationStartsAt?: number;
  vacationEndsAt?: number;
  vacationOpenEnded?: boolean;
  vacationStintStartedAt?: number;
  /** Ended stints still credited when computing think time after vacation stops. */
  vacationClockStints?: VacationClockStint[];
};

export type VacationWindow = {
  pauseStart: number;
  pauseEnd: number;
};

export type VacationSnapshot = {
  vacationPauseMsUsed: number;
  vacationQuotaMsRemaining: number;
  vacationBlocksRemaining: number;
  vacationQuotaYear: number;
  vacationStartsAt?: number;
  vacationEndsAt?: number;
  vacationOpenEnded: boolean;
  vacationActive: boolean;
  vacationScheduled: boolean;
};

export type VacationValidationError =
  | 'vacation_stint_active'
  | 'vacation_no_quota'
  | 'vacation_invalid_range'
  | 'vacation_ends_in_past'
  | 'vacation_not_scheduled'
  | 'vacation_end_passed'
  | 'vacation_nothing_to_stop';
