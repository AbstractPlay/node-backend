import { gameinfo } from '@abstractplay/gameslib';
import { headers, formatReturnError } from '../api/http.js';
import type { PartialClaims } from '../api/types.js';
import { getBotRecord } from '../participants.js';
import { getToMovePlayerIds, loadGameRecord } from '../botOutbound.js';
import { submitMove } from '../games/playHandlers.js';

/** Bot Lambda `move` verb — validates turn then delegates to shared submitMove. */
export async function handleMove(
  claims: PartialClaims,
  pars: { gameid: string; move: string; metaGame: string },
) {
  const botId = claims.sub;
  console.log(`handleMove: Bot ${botId} is making move ${pars.move} in game ${pars.gameid}`);

  if (!pars.metaGame) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'metaGame is required' }),
      headers,
    };
  }

  const bot = await getBotRecord(botId);
  if (!bot) {
    return formatReturnError(`Unknown bot ${botId}`);
  }

  const game = await loadGameRecord(pars.metaGame, pars.gameid);
  if (!game) {
    return formatReturnError(`Unable to load game ${pars.gameid}`);
  }

  if (!game.players.some(p => p.id === botId)) {
    return formatReturnError(`Bot ${botId} is not a player in game ${pars.gameid}`);
  }

  const info = gameinfo.get(pars.metaGame);
  const simultaneous = info.flags !== undefined && info.flags.includes('simultaneous');
  const toMoveIds = getToMovePlayerIds(game, simultaneous);
  if (!toMoveIds.includes(botId)) {
    return formatReturnError(`It is not bot ${botId}'s turn in game ${pars.gameid}`);
  }

  return await submitMove(botId, {
    id: pars.gameid,
    move: pars.move,
    metaGame: pars.metaGame,
    cbit: 0,
    draw: '',
  });
}
