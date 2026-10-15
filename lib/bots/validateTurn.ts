import { gameinfo } from '@abstractplay/gameslib';
import { formatReturnError, headers } from '../api/http.js';
import type { ApiHandlerResult } from '../api/routeTypes.js';
import { getToMovePlayerIds, loadGameRecord } from '../botOutbound.js';
import { getBotRecord, type BotRecord } from '../participants.js';

type BotTurnGame = NonNullable<Awaited<ReturnType<typeof loadGameRecord>>>;

export type BotTurnContext = {
  metaGame: string;
  gameid: string;
};

/**
 * Shared gate for bot `move` and `pie`: registered bot, seated, correct turn.
 */
export async function validateBotTurn(
  botId: string,
  pars: BotTurnContext,
): Promise<
  { ok: true; bot: BotRecord; game: BotTurnGame }
  | { ok: false; response: ApiHandlerResult }
> {
  if (!pars.metaGame) {
    return {
      ok: false,
      response: {
        statusCode: 400,
        body: JSON.stringify({ message: 'metaGame is required' }),
        headers,
      },
    };
  }

  const bot = await getBotRecord(botId);
  if (!bot) {
    return { ok: false, response: formatReturnError(`Unknown bot ${botId}`) };
  }

  const game = await loadGameRecord(pars.metaGame, pars.gameid);
  if (!game) {
    return { ok: false, response: formatReturnError(`Unable to load game ${pars.gameid}`) };
  }

  if (!game.players.some((p) => p.id === botId)) {
    return { ok: false, response: formatReturnError(`Bot ${botId} is not a player in game ${pars.gameid}`) };
  }

  const info = gameinfo.get(pars.metaGame);
  const simultaneous = info.flags !== undefined && info.flags.includes('simultaneous');
  const toMoveIds = getToMovePlayerIds(game, simultaneous);
  if (!toMoveIds.includes(botId)) {
    return {
      ok: false,
      response: formatReturnError(`It is not bot ${botId}'s turn in game ${pars.gameid}`),
    };
  }

  return { ok: true, bot, game };
}
