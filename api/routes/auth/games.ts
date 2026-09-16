import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import { game } from '../../../lib/games/getGame.js';
import { startSoloGame } from '../../../lib/games/solo.js';
import {
  injectState,
  toggleStar,
  updateGameSettings,
  updateUserSettings,
} from '../../../lib/games/playerSettings.js';
import {
  checkForAbandonedGame,
  checkForTimeloss,
  getExploration,
  getPrivateExploration,
  invokePie,
  saveExploration,
  setLastSeen,
  submitComment,
  submitMove,
  updateCommented,
  updateNote,
} from '../../abstractplay.js';
import { bindAuth } from './shared.js';

export const gamesAuthRoutes: Record<string, AuthRouteHandler> = {
  start_solo_game: bindAuth(startSoloGame),
  submit_move: bindAuth(submitMove),
  timeloss: bindAuth(checkForTimeloss),
  abandoned: bindAuth(checkForAbandonedGame),
  invoke_pie: bindAuth(invokePie),
  update_note: bindAuth(updateNote),
  update_commented: bindAuth(updateCommented),
  set_lastSeen: bindAuth(setLastSeen),
  submit_comment: bindAuth(submitComment),
  save_exploration: bindAuth(saveExploration),
  get_exploration: bindAuth(getExploration),
  get_private_exploration: bindAuth(getPrivateExploration),
  get_game: (claims, pars) => game(claims.sub, pars),
  toggle_star: bindAuth(toggleStar),
  set_game_state: bindAuth(injectState),
  update_game_settings: bindAuth(updateGameSettings),
  update_user_settings: bindAuth(updateUserSettings),
};
