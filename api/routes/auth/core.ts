import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  deleteGames,
  fixGames,
  markAsPublished,
  onetimeFix,
  purgeRetiredCompletedGames,
  testAsync,
  updateMetaGameCounts,
} from '../../abstractplay.js';
import { bindAuth } from './shared.js';

export const coreAuthRoutes: Record<string, AuthRouteHandler> = {
  update_meta_game_counts: (claims) => updateMetaGameCounts(claims.sub),
  purge_retired_completed_games: (claims) => purgeRetiredCompletedGames(claims.sub),
  mark_published: bindAuth(markAsPublished),
  onetime_fix: (claims) => onetimeFix(claims.sub),
  fix_games: bindAuth(fixGames),
  test_async: bindAuth(testAsync),
  delete_games: bindAuth(deleteGames),
};
