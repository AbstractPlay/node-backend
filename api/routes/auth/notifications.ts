import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  dismissAllNotificationsAuth,
  dismissNotificationAuth,
  listNotificationsAuth,
  markNotificationsSeenAuth,
} from '../../../lib/notifications/authHandlers.js';
import { bindAuth } from './shared.js';

export const notificationsAuthRoutes: Record<string, AuthRouteHandler> = {
  dismiss_notification: bindAuth(dismissNotificationAuth),
  dismiss_all_notifications: (claims) => dismissAllNotificationsAuth(claims.sub),
  list_notifications: (claims) => listNotificationsAuth(claims.sub),
  mark_notifications_seen: bindAuth(markNotificationsSeenAuth),
};
