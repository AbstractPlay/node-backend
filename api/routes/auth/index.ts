import { headers } from '../../../lib/api/http.js';
import type { ApiHandlerResult } from '../../../lib/api/routeTypes.js';
import type { PartialClaims } from '../../../lib/api/types.js';
import { analyticsAuthRoutes } from './analytics.js';
import { announcementsAuthRoutes } from './announcements.js';
import { coreAuthRoutes } from './core.js';
import { feedbackAuthRoutes } from './feedback.js';
import { marksAuthRoutes } from './marks.js';
import { notificationsAuthRoutes } from './notifications.js';
import { playgroundAuthRoutes } from './playground.js';
import { meDeprecatedResponse } from './shared.js';

export const authRoutes: Record<string, import('../../../lib/api/routeTypes.js').AuthRouteHandler> = {
  me: async () => meDeprecatedResponse(),
  ...coreAuthRoutes,
  ...notificationsAuthRoutes,
  ...playgroundAuthRoutes,
  ...marksAuthRoutes,
  ...analyticsAuthRoutes,
  ...feedbackAuthRoutes,
  ...announcementsAuthRoutes,
};

export async function runAuthQuery(
  queryName: string | undefined,
  claims: PartialClaims,
  pars: any,
): Promise<ApiHandlerResult> {
  const handler = queryName ? authRoutes[queryName] : undefined;
  if (!handler) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Unable to execute unknown query '${queryName}'`,
      }),
      headers,
    };
  }
  const result = await handler(claims, pars);
  return result ?? {
    statusCode: 500,
    body: JSON.stringify({ message: 'Handler returned no response' }),
    headers,
  };
}
