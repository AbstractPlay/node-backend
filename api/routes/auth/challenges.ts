import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  newChallenge,
  respondedChallenge,
  revokeChallenge,
} from '../../../lib/challenges/authHandlers.js';
import { bindAuth } from './shared.js';

export const challengesAuthRoutes: Record<string, AuthRouteHandler> = {
  new_challenge: bindAuth(newChallenge),
  challenge_revoke: bindAuth(revokeChallenge),
  challenge_response: bindAuth(respondedChallenge),
};
