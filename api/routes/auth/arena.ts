import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import { bindAuth } from './shared.js';
import {
  handleAcceptArenaSeatSwap,
  handleCancelArenaTable,
  handleCreateArenaTable,
  handleGetArenaTable,
  handleJoinArenaTable,
  handleLeaveArenaTable,
  handleProposeArenaSeatSwap,
  handleRejectArenaSeatSwap,
  handleSetArenaReady,
  handleArenaPlayReady,
  handleGetMyArenaTable,
} from '../../../lib/arena/arenaTableHandlers.js';
import { submitArenaFeedback } from '../../../lib/arena/submitArenaFeedback.js';

export const arenaAuthRoutes: Record<string, AuthRouteHandler> = {
  submit_arena_feedback: bindAuth(submitArenaFeedback),
  create_arena_table: bindAuth(handleCreateArenaTable),
  join_arena_table: bindAuth(handleJoinArenaTable),
  leave_arena_table: bindAuth(handleLeaveArenaTable),
  cancel_arena_table: bindAuth(handleCancelArenaTable),
  get_arena_table: bindAuth(handleGetArenaTable),
  get_my_arena_table: bindAuth(handleGetMyArenaTable),
  set_arena_ready: bindAuth(handleSetArenaReady),
  arena_play_ready: bindAuth(handleArenaPlayReady),
  propose_arena_seat_swap: bindAuth(handleProposeArenaSeatSwap),
  accept_arena_seat_swap: bindAuth(handleAcceptArenaSeatSwap),
  reject_arena_seat_swap: bindAuth(handleRejectArenaSeatSwap),
};
