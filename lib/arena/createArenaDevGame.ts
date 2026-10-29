import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { formatReturnError, headers } from '../api/http.js';
import { createArenaGame } from './createArenaGame.js';

export async function createArenaDevGame(
  userid: string,
  pars: {
    metaGame: string;
    tcId: string;
    opponentId: string;
    gameId?: string;
    variants?: string[];
  },
) {
  const stage = process.env.WEBSOCKET_STAGE ?? 'dev';
  if (stage === 'prod') {
    return formatReturnError('create_arena_dev_game is not available in production.');
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    return formatReturnError('Server misconfigured.');
  }

  if (!pars.opponentId || pars.opponentId === userid) {
    return formatReturnError('opponentId must be another user.');
  }

  const gameId = pars.gameId ?? uuid();

  try {
    await createArenaGame({
      client: ddbDocClient,
      tableName,
      gameId,
      metaGame: pars.metaGame,
      tcId: pars.tcId,
      playerIds: [userid, pars.opponentId],
      variants: pars.variants,
      armCountdownImmediately: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return formatReturnError(msg);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      gameId,
      metaGame: pars.metaGame,
      playMode: 'arena',
    }),
    headers,
  };
}
