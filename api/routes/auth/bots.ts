import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  beginBotSecretRotation,
  createBot,
  deleteBot,
  finalizeBotSecretRotation,
  updateBot,
} from '../../../lib/bots/crud.js';
import { pingBot, testPush } from '../../../lib/bots/ping.js';
import { testBotStatus, updateTestBot } from '../../testBot.js';
import { bindAuth, bindClaims } from './shared.js';

export const botsAuthRoutes: Record<string, AuthRouteHandler> = {
  create_bot: bindClaims(createBot),
  createBot: bindClaims(createBot),
  update_bot: bindClaims(updateBot),
  updateBot: bindClaims(updateBot),
  delete_bot: bindClaims(deleteBot),
  deleteBot: bindClaims(deleteBot),
  begin_bot_secret_rotation: bindClaims(beginBotSecretRotation),
  beginBotSecretRotation: bindClaims(beginBotSecretRotation),
  finalize_bot_secret_rotation: bindClaims(finalizeBotSecretRotation),
  finalizeBotSecretRotation: bindClaims(finalizeBotSecretRotation),
  test_bot_status: (claims) => testBotStatus(claims),
  update_test_bot: (claims, pars) => updateTestBot(claims, pars),
  ping_bot: bindAuth(pingBot),
  test_push: (claims) => testPush(claims.sub),
};
