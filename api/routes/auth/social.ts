import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import { allStandingChallenges, standingChallenges } from '../../../lib/public/index.js';
import {
  block_player,
  setPublicRivalries,
  unblock_player,
  updateStanding,
} from '../../../lib/profile/social.js';
import { bindAuth } from './shared.js';

export const socialAuthRoutes: Record<string, AuthRouteHandler> = {
  set_public_rivalries: bindAuth(setPublicRivalries),
  update_standing: bindAuth(updateStanding),
  block_player: bindAuth(block_player),
  unblock_player: bindAuth(unblock_player),
  standing_challenges: (claims, pars) => standingChallenges({ ...pars, userId: claims.sub }),
  all_standing_challenges: (claims) => allStandingChallenges(claims.sub),
};
