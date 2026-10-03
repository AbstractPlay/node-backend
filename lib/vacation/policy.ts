import type { VacationValidationError } from './types.js';

/**
 * Vacation applies to all correspondence games (casual, tournament, event, solo;
 * hard and soft clocks). Schedule/stop does not inspect individual games.
 */
export type VacationSchedulePolicyContext = {
  userId: string;
};

export function vacationSchedulePolicyError(
  _context: VacationSchedulePolicyContext,
): VacationValidationError | null {
  return null;
}
