import type { PartialClaims } from '../api/types.js';
import { submitMove } from '../games/playHandlers.js';
import { validateBotTurn } from './validateTurn.js';

/** Bot Lambda `move` verb — validates turn then delegates to shared submitMove. */
export async function handleMove(
  claims: PartialClaims,
  pars: { gameid: string; move: string; metaGame: string },
) {
  const botId = claims.sub;
  console.log(`handleMove: Bot ${botId} is making move ${pars.move} in game ${pars.gameid}`);

  const gate = await validateBotTurn(botId, {
    gameid: pars.gameid,
    metaGame: pars.metaGame,
  });
  if (!gate.ok) {
    return gate.response;
  }

  return await submitMove(botId, {
    id: pars.gameid,
    move: pars.move,
    metaGame: pars.metaGame,
    cbit: 0,
    draw: '',
  });
}
