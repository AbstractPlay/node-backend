import { headers } from '../../lib/api/http.js';
import type { ApiHandlerResult, BotRouteHandler } from '../../lib/api/routeTypes.js';
import type { PartialClaims } from '../../lib/api/types.js';
import { handleMove } from '../../lib/bots/move.js';
import { handlePie } from '../../lib/bots/pie.js';
import { handlePingOwner } from '../../lib/bots/pingOwner.js';

export const botRoutes: Record<string, BotRouteHandler> = {
  move: (claims, body) =>
    handleMove(claims, body as { gameid: string; move: string; metaGame: string }),
  pie: (claims, body) =>
    handlePie(claims, body as { gameid: string; metaGame: string }),
  pingOwner: (claims, body) => handlePingOwner(claims, body),
};

export async function runBotVerb(
  verb: string | undefined,
  claims: PartialClaims,
  body: Record<string, unknown>,
): Promise<ApiHandlerResult> {
  const handler = verb ? botRoutes[verb] : undefined;
  if (!handler) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `Unknown bot verb '${verb}'`,
      }),
      headers,
    };
  }
  return handler(claims, body);
}
