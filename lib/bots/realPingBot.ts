import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { formatReturnError, logGetItemError } from '../api/http.js';
import { hydrateGameState } from '../gameState.js';
import { notifyRegisteredBotsTurn } from './notifyTurn.js';

type FullGame = {
  metaGame: string;
  state: string;
  toMove: string | boolean[];
  players: { id: string }[];
};

/** After a move or game event, notify registered bots when it is their turn. */
export async function realPingBot(metaGame: string, gameid: string, game?: FullGame) {
  if (game === undefined) {
    try {
      const data = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            pk: 'GAME',
            sk: metaGame + '#0#' + gameid,
          },
        }));
      if (!data.Item) {
        throw new Error(`No game ${metaGame + '#0#' + gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
      }
      game = hydrateGameState(data.Item as FullGame);
    } catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to load game ${gameid} to make a bot move`);
    }
  }

  if (game === undefined) {
    throw new Error('Unable to load game object');
  }

  await notifyRegisteredBotsTurn(metaGame, gameid, game);
}
