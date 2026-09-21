import type { AnnouncementGetPars, AnnouncementsListPars } from '../../lib/announcements/index.js';
import { headers } from '../../lib/api/http.js';
import type { ApiHandlerResult, PublicRouteHandler } from '../../lib/api/routeTypes.js';
import { botMove } from '../../lib/games/playHandlers.js';
import {
  allStandingChallenges,
  announcementGetOpen,
  announcementsListOpen,
  archiveTournaments,
  challengeDetails,
  eventGetEvent,
  eventGetEvents,
  feedbackGetOpen,
  feedbackHistoryListOpen,
  feedbackListOpen,
  feedbackWishlistSearchOpen,
  feedbackTagVocabOpen,
  game,
  games,
  getOldTournaments,
  getPublicExploration,
  getTournament,
  getTournaments,
  logLayoutEventOpen,
  metaGamesDetails,
  playerAbout,
  playerHighlights,
  recentCompletedGames,
  representativeGames,
  reportProblem,
  standingChallenges,
  userNames,
} from '../../lib/public/index.js';

export const publicRoutes: Record<string, PublicRouteHandler> = {
  user_names: () => userNames(),
  challenge_details: (pars) => challengeDetails(pars),
  standing_challenges: (pars) => standingChallenges(pars),
  all_standing_challenges: () => allStandingChallenges(),
  recent_completed_games: (pars) => recentCompletedGames(pars),
  games: (pars) => games(pars),
  meta_games: () => metaGamesDetails(),
  get_game: (pars) => game('', pars),
  get_public_exploration: (pars) => getPublicExploration(pars),
  bot_move: (pars) => botMove(pars),
  get_tournaments: () => getTournaments(),
  get_old_tournaments: (pars) => getOldTournaments(pars),
  get_tournament: (pars) => getTournament(pars),
  archive_tournaments: () => archiveTournaments(),
  get_event: (pars) => eventGetEvent(pars),
  get_events: () => eventGetEvents(),
  player_highlights: (pars) => playerHighlights(pars),
  player_about: (pars) => playerAbout(pars),
  representative_games: (pars) => representativeGames(pars),
  log_gamemove_layout_event: (pars) => logLayoutEventOpen(pars),
  report_problem: (pars) => reportProblem(pars),
  feedback_list: (pars) => feedbackListOpen(pars),
  feedback_get: (pars) => feedbackGetOpen(pars),
  feedback_tag_vocab: () => feedbackTagVocabOpen(),
  wishlist_search: (pars) => feedbackWishlistSearchOpen(pars),
  feedback_history_list: (pars) => feedbackHistoryListOpen(pars),
  announcements_list: (pars) => announcementsListOpen(pars as AnnouncementsListPars),
  announcement_get: (pars) => announcementGetOpen(pars as AnnouncementGetPars),
};

export async function runPublicQuery(
  queryName: string | undefined,
  pars: any,
): Promise<ApiHandlerResult> {
  const handler = queryName ? publicRoutes[queryName] : undefined;
  if (!handler) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Unable to execute unknown open query '${pars?.query ?? queryName}'`,
      }),
      headers,
    };
  }
  const result = await handler(pars);
  return result ?? {
    statusCode: 500,
    body: JSON.stringify({ message: 'Handler returned no response' }),
    headers,
  };
}
