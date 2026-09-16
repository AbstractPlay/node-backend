import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  highlightGameAuth,
  recommendGameAuth,
  unhighlightGameAuth,
  unrecommendGameAuth,
  unwatchGameAuth,
  watchGameAuth,
} from '../../../lib/playerGameMarks/authHandlers.js';
import { bindAuth } from './shared.js';

export const marksAuthRoutes: Record<string, AuthRouteHandler> = {
  watch_game: bindAuth(watchGameAuth),
  unwatch_game: bindAuth(unwatchGameAuth),
  highlight_game: bindAuth(highlightGameAuth),
  unhighlight_game: bindAuth(unhighlightGameAuth),
  recommend_game: bindAuth(recommendGameAuth),
  unrecommend_game: bindAuth(unrecommendGameAuth),
};
