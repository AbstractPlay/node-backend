import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  deleteCustomization,
  deletePush,
  meDashboard,
  meProfile,
  mySettings,
  newProfile,
  newSetting,
  nextGame,
  saveCustomization,
  savePush,
  saveTags,
  setPush,
} from '../../../lib/profile/me.js';
import { bindAuth, bindClaims } from './shared.js';

export const profileAuthRoutes: Record<string, AuthRouteHandler> = {
  me_profile: (claims) => meProfile(claims),
  me_dashboard: (claims, pars) => meDashboard(claims, pars),
  next_game: (claims) => nextGame(claims.sub),
  my_settings: (claims) => mySettings(claims),
  new_setting: bindAuth(newSetting),
  new_profile: bindClaims(newProfile),
  set_push: bindAuth(setPush),
  save_push: bindAuth(savePush),
  delete_push: bindAuth(deletePush),
  save_tags: bindAuth(saveTags),
  save_customization: bindAuth(saveCustomization),
  delete_customization: bindAuth(deleteCustomization),
};
