import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  scheduleVacationAuth,
  stopVacationAuth,
  updateVacationAuth,
} from '../../../lib/vacation/authHandlers.js';
import { bindAuth } from './shared.js';

export const vacationAuthRoutes: Record<string, AuthRouteHandler> = {
  schedule_vacation: bindAuth(scheduleVacationAuth),
  update_vacation: bindAuth(updateVacationAuth),
  stop_vacation: (claims) => stopVacationAuth(claims.sub),
};
