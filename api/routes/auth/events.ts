import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  eventClose,
  eventCreate,
  eventCreateGames,
  eventDelete,
  eventPublish,
  eventRegister,
  eventUpdateDesc,
  eventUpdateDivisions,
  eventUpdateInvites,
  eventUpdateName,
  eventUpdateResult,
  eventUpdateStart,
  eventWithdraw,
} from '../../../lib/events/authHandlers.js';
import { bindAuth } from './shared.js';

export const eventsAuthRoutes: Record<string, AuthRouteHandler> = {
  event_create: bindAuth(eventCreate),
  event_delete: bindAuth(eventDelete),
  event_publish: bindAuth(eventPublish),
  event_register: bindAuth(eventRegister),
  event_withdraw: bindAuth(eventWithdraw),
  event_update_start: bindAuth(eventUpdateStart),
  event_update_name: bindAuth(eventUpdateName),
  event_update_desc: bindAuth(eventUpdateDesc),
  event_update_invites: bindAuth(eventUpdateInvites),
  event_update_result: bindAuth(eventUpdateResult),
  event_update_divisions: bindAuth(eventUpdateDivisions),
  event_create_games: bindAuth(eventCreateGames),
  event_close: bindAuth(eventClose),
};
