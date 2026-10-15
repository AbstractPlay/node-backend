import type { PartialClaims } from '../api/types.js';
import { invokePie } from '../games/playHandlers.js';
import { isBotApplyFailureResponse, recordBotApplyFailure } from './ownerAlerts.js';
import { validateBotTurn } from './validateTurn.js';

/** Bot Lambda `pie` verb — seat swap (pie) with the same turn checks as `move`. */
export async function handlePie(
  claims: PartialClaims,
  pars: { gameid: string; metaGame: string },
) {
  const botId = claims.sub;
  console.log(`handlePie: Bot ${botId} invoking pie in game ${pars.gameid}`);

  const gate = await validateBotTurn(botId, pars);
  if (!gate.ok) {
    return gate.response;
  }

  const response = await invokePie(botId, { id: pars.gameid, metaGame: pars.metaGame, cbit: 0 });
  if (isBotApplyFailureResponse(response)) {
    const variants = gate.game.variants ?? [];
    await recordBotApplyFailure({
      botId,
      bot: gate.bot,
      game: gate.game,
      gameid: pars.gameid,
      metaGame: pars.metaGame,
      variants,
      verb: 'pie',
      response,
    });
  }
  return response;
}
