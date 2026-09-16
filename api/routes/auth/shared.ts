import { headers } from '../../../lib/api/http.js';
import type { ApiHandlerResult, AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import type { PartialClaims } from '../../../lib/api/types.js';

export const meDeprecatedResponse = (): ApiHandlerResult => ({
  statusCode: 200,
  body: JSON.stringify({
    deprecated: true,
    message: 'me is retired. Use me_profile for site-wide bootstrap and me_dashboard for the /me page.',
    useInstead: ['me_profile', 'me_dashboard'],
  }),
  headers,
});

export function bindAuth(
  handler: (userId: string, pars: any) => Promise<ApiHandlerResult | undefined>,
): AuthRouteHandler {
  return (claims, pars) => handler(claims.sub, pars) as Promise<ApiHandlerResult>;
}

export function bindClaims(
  handler: (claims: PartialClaims, pars: any) => Promise<ApiHandlerResult | undefined>,
): AuthRouteHandler {
  return (claims, pars) => handler(claims, pars) as Promise<ApiHandlerResult>;
}
