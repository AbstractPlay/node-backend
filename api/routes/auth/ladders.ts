import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  handleGetLadder,
  handleJoinLadder,
  handleJoinLadderPool,
  handleLeaveLadder,
  handleLeaveLadderPool,
  handleNewLadder,
  handleNewLadderChallenge,
  handleRespondLadderChallenge,
  handleSubmitLadderComment,
} from '../../../lib/ladders/handlers.js';
import { bindAuth } from './shared.js';

export const laddersAuthRoutes: Record<string, AuthRouteHandler> = {
  new_ladder: bindAuth(handleNewLadder),
  join_ladder: bindAuth(handleJoinLadder),
  leave_ladder: bindAuth(handleLeaveLadder),
  get_ladder: bindAuth((userid, pars) => handleGetLadder(pars, userid)),
  join_ladder_pool: bindAuth(handleJoinLadderPool),
  leave_ladder_pool: bindAuth(handleLeaveLadderPool),
  new_ladder_challenge: bindAuth(handleNewLadderChallenge),
  respond_ladder_challenge: bindAuth(handleRespondLadderChallenge),
  submit_ladder_comment: bindAuth(handleSubmitLadderComment),
};
