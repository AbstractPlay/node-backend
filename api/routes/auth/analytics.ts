import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  logLayoutEventAuth,
  logRecommendationEventAuth,
} from '../../../lib/analytics/authHandlers.js';
import { bindAuth } from './shared.js';

export const analyticsAuthRoutes: Record<string, AuthRouteHandler> = {
  log_recommendation_event: bindAuth(logRecommendationEventAuth),
  log_gamemove_layout_event: bindAuth(logLayoutEventAuth),
};
