import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  endATournament,
  joinTournament,
  newTournament,
  withdrawTournament,
} from '../../../lib/tournaments/authHandlers.js';
import { bindAuth } from './shared.js';

export const tournamentsAuthRoutes: Record<string, AuthRouteHandler> = {
  new_tournament: bindAuth(newTournament),
  join_tournament: bindAuth(joinTournament),
  withdraw_tournament: bindAuth(withdrawTournament),
  end_tournament: bindAuth(endATournament),
};
