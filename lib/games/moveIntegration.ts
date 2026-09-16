/** Registered from `api/abstractplay.ts` so move logic can stay in lib without importing the monolith. */

export type EventGameUpdatePars = { eventid: string; gameid: string; winner: string[] };

let eventGameUpdater: ((pars: EventGameUpdatePars) => Promise<unknown>) | null = null;
let tournamentDivisionCompleter: ((tournament: unknown) => Promise<unknown>) | null = null;

export function registerMoveIntegration(hooks: {
  eventGameUpdater?: (pars: EventGameUpdatePars) => Promise<unknown>;
  tournamentDivisionCompleter?: (tournament: unknown) => Promise<unknown>;
}) {
  if (hooks.eventGameUpdater) {
    eventGameUpdater = hooks.eventGameUpdater;
  }
  if (hooks.tournamentDivisionCompleter) {
    tournamentDivisionCompleter = hooks.tournamentDivisionCompleter;
  }
}

export function callEventGameUpdater(pars: EventGameUpdatePars) {
  if (!eventGameUpdater) {
    throw new Error('eventGameUpdater is not registered');
  }
  return eventGameUpdater(pars);
}

export function callTournamentDivisionCompleter(tournament: unknown) {
  if (!tournamentDivisionCompleter) {
    throw new Error('tournamentDivisionCompleter is not registered');
  }
  return tournamentDivisionCompleter(tournament);
}
