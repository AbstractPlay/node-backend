import { registerMoveIntegration } from './moveIntegration.js';
import { eventUpdates } from '../events/authHandlers.js';
import { endTournament, type Tournament } from '../tournaments/authHandlers.js';

registerMoveIntegration({
  eventGameUpdater: eventUpdates,
  tournamentDivisionCompleter: (tournament) =>
    endTournament(tournament as Tournament),
});
