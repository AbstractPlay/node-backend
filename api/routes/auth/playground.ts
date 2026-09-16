import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  createPlaygroundSaveAuth,
  deletePlaygroundSaveAuth,
  getPlaygroundSaveAuth,
  listPlaygroundSavesAuth,
  savePlaygroundSaveAuth,
} from '../../../lib/playground/authHandlers.js';
import { bindAuth } from './shared.js';

export const playgroundAuthRoutes: Record<string, AuthRouteHandler> = {
  list_playground_saves: (claims) => listPlaygroundSavesAuth(claims.sub),
  get_playground_save: bindAuth(getPlaygroundSaveAuth),
  create_playground_save: bindAuth(createPlaygroundSaveAuth),
  save_playground_save: bindAuth(savePlaygroundSaveAuth),
  delete_playground_save: bindAuth(deletePlaygroundSaveAuth),
};
