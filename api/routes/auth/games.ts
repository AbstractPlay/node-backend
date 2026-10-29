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
  submitComment,
  submitMove,
} from '../../../lib/games/playHandlers.js';
import {
  teachingGrantUndo,
  teachingKeepMove,
  teachingUndoMove,
} from '../../../lib/games/teachingMode.js';
import {
  setLastSeen,
  updateCommented,
  updateNote,
} from '../../../lib/games/adminHandlers.js';
import { bindAuth } from './shared.js';
import { submitArenaMove } from '../../../lib/arena/submitArenaMove.js';
import { createArenaDevGame } from '../../../lib/arena/createArenaDevGame.js';

export const gamesAuthRoutes: Record<string, AuthRouteHandler> = {
  start_solo_game: bindAuth(startSoloGame),
  submit_move: bindAuth(submitMove),
  submit_arena_move: bindAuth(submitArenaMove),
  create_arena_dev_game: bindAuth(createArenaDevGame),
  timeloss: bindAuth(checkForTimeloss),
  abandoned: bindAuth(checkForAbandonedGame),
  invoke_pie: bindAuth(invokePie),
  teaching_grant_undo: bindAuth(teachingGrantUndo),
  teaching_keep_move: bindAuth(teachingKeepMove),
  teaching_undo_move: bindAuth(teachingUndoMove),
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
