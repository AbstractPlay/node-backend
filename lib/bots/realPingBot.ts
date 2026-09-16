import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand, type SendMessageRequest } from '@aws-sdk/client-sqs';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { sqsClient } from '../api/clients.js';
import { formatReturnError, logGetItemError } from '../api/http.js';
import { hydrateGameState } from '../gameState.js';
import { notifyRegisteredBotsTurn } from './notifyTurn.js';

type FullGame = {
  metaGame: string;
  state: string;
  toMove: string | boolean[];
  players: { id: string }[];
};

export async function realPingBot(metaGame: string, gameid: string, game?: FullGame) {
  // fetch game record and state
  if (game === undefined) {
    try {
      const data = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": metaGame + "#0#" + gameid
          },
        }));
      if (!data.Item)
        throw new Error(`No game ${metaGame + "#0#" + gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
      game = hydrateGameState(data.Item as FullGame);
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to load game ${gameid} to make a bot move`);
    }
  }

  // instantiate game object
  if (game === undefined) {
    throw new Error("Unable to load game object");
  }
  const engine = GameFactory(metaGame, game.state);
  if (!engine)
    throw new Error(`Unknown metaGame ${metaGame}`);
  const info = gameinfo.get(metaGame);

  // notify AiAi bot, if necessary
  // get list of userIDs whose turn it is
  if (!engine.gameover) {
    const ids: string[] = [];
    if (info.flags.includes("simultaneous")) {
      for (let i = 0; i < (game.toMove as boolean[]).length; i++) {
        if (game.toMove[i]) {
          ids.push(game.players[i].id);
        }
      }
    } else {
      ids.push(game.players[parseInt(game.toMove as string, 10)].id);
    }
    if (ids.includes(process.env.AIAI_USERID!)) {
      // construct message
      const body = {
        meta: metaGame,
        mgl: engine.aiaiMgl(),
        gameid: gameid,
        history: engine.state2aiai(),
      }
      const input: SendMessageRequest = {
        QueueUrl: process.env.SQS_URL,
        MessageBody: JSON.stringify(body),
      }
      const cmd = new SendMessageCommand(input);
      await sqsClient.send(cmd);
    }
  }

  await notifyRegisteredBotsTurn(metaGame, gameid, game);
}
