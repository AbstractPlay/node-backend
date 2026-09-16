import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { GameFactory } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { logGetItemError } from '../api/http.js';
import { effectiveFlags, flagSetIncludes } from '../effectiveGameFlags.js';
import { hydrateGameState, prepareGameStateForStorage, setGameEndedFromEngine } from '../gameState.js';
import type { GameMarkSummary } from '../playerGameMarks.js';
import { updateWatcherSummaries } from '../playerGameMarks.js';
import { getPlayers } from '../players/getPlayers.js';
import {
  collectGameEndScoresFromEngine,
  enqueueGameEndNotifications,
  inAppSettingsMapFromUsers,
} from '../notifications.js';
import type { User } from '../api/types.js';

type FullGame = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  state: string;
  players: User[];
  clockHard: boolean;
  noExplore?: boolean;
  winner?: number[];
  toMove: string | boolean[];
  lastMoveTime: number;
  tournament?: string;
  division?: number;
  variants?: string[];
  gameEnded?: number;
  numMoves?: number;
};

type Game = {
  id: string;
  metaGame: string;
  players: User[];
  clockHard: boolean;
  noExplore: boolean;
  winner?: number[];
  toMove: string | boolean[];
  lastMoveTime: number;
  gameStarted: number;
  gameEnded: number;
  numMoves: number;
  variants?: string[];
};

function toNotificationGame(
  game: Pick<FullGame, 'id' | 'metaGame' | 'variants' | 'players' | 'winner'>,
  scores?: ReturnType<typeof collectGameEndScoresFromEngine>,
) {
  return {
    id: game.id,
    metaGame: game.metaGame,
    variants: game.variants,
    players: game.players.map(p => ({ id: p.id, name: p.name })),
    winner: game.winner,
    ...(scores !== undefined && scores.length > 0 ? { scores } : {}),
  };
}

async function tournamentUpdates(game: FullGame, players: { id: string; name: string }[], timeout: number | undefined) {
  const work: Promise<unknown>[] = [];
  for (let i = 0; i < 2; i++) {
    const player = players[i];
    let score = 0;
    if (game.winner?.length === 1 && game.players[game.winner[0] - 1].id === player.id) {
      score = 1;
    } else if (game.winner?.length === 2) {
      score = 0.5;
    }
    work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: 'TOURNAMENTPLAYER', sk: game.tournament + '#' + game.division!.toString() + '#' + player.id },
      ExpressionAttributeNames: { '#s': 'score', '#t': 'timeout' },
      ExpressionAttributeValues: { ':inc': score, ':t': i === timeout },
      UpdateExpression: 'add #s :inc set #t = :t',
    })));
  }
  const winner = game.winner?.map((w: number) => game.players[w - 1].id);
  work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: 'TOURNAMENTGAME', sk: game.tournament + '#' + game.division!.toString() + '#' + game.id },
    ExpressionAttributeNames: { '#w': 'winner' },
    ExpressionAttributeValues: { ':w': winner },
    UpdateExpression: 'set #w = :w',
  })));
  await sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: 'TOURNAMENT', sk: game.tournament },
    ExpressionAttributeNames: { '#d': 'divisions', '#n': game.division!.toString() },
    ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
    UpdateExpression: 'set #d.#n.numCompleted = if_not_exists(#d.#n.numCompleted, :zero) + :inc',
    ReturnValues: 'ALL_NEW',
  }));
  return Promise.all(work);
}

export async function timeloss(
  check: boolean,
  player: number,
  gameid: string,
  metaGame: string,
  timestamp: number,
) {
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'GAME',
          sk: metaGame + '#0#' + gameid,
        },
      }));
  } catch (error) {
    logGetItemError(error);
    throw new Error(`Unable to get game ${metaGame}, ${gameid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item) {
    throw new Error(`No game ${metaGame}, ${gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }

  const game = hydrateGameState(data.Item as FullGame);
  if (check) {
    console.log('game.toMove', game.toMove);
    if (Array.isArray(game.toMove)) {
      let minTime = 0;
      let minIndex = -1;
      const elapsed = Date.now() - game.lastMoveTime;
      game.toMove.forEach((p: boolean, i: number) => {
        if (p && game.players[i].time! - elapsed < minTime) {
          minTime = game.players[i].time! - elapsed;
          minIndex = i;
        }
      });
      if (minIndex !== -1) {
        player = minIndex;
      } else {
        throw "Nobody's time is up!";
      }
    } else {
      if (game.toMove === '') {
        throw 'Game is already over!';
      }
      const toMove = parseInt(game.toMove as string, 10);
      if (game.players[toMove].time! - (Date.now() - game.lastMoveTime) < 0) {
        player = toMove;
      } else {
        throw "Opponent's time isn't up!";
      }
    }
  }
  const engine = GameFactory(game.metaGame, game.state);
  if (!engine) {
    throw new Error(`Unknown metaGame ${game.metaGame}`);
  }
  engine.timeout(player + 1);
  game.state = engine.serialize();
  game.toMove = '';
  game.winner = engine.winner;
  game.numMoves = engine.state().stack.length - 1;
  game.lastMoveTime = timestamp;
  setGameEndedFromEngine(game, engine);
  const playerIDs = game.players.map((p: { id: string }) => p.id);
  const players = await getPlayers(playerIDs);

  const playerGame = {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore || false,
    winner: game.winner,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
    gameStarted: new Date(engine.stack[0]._timestamp).getTime(),
    gameEnded: new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
    numMoves: engine.stack.length - 1,
    variants: engine.variants,
  } as Game;
  const work: Promise<unknown>[] = [];

  work.push(ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: 'GAME',
        sk: game.sk,
      },
    }),
  ));
  console.log('Scheduled delete and updates to game lists');
  game.sk = game.metaGame + '#1#' + game.id;

  work.push(ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: prepareGameStateForStorage(game),
  })));

  work.push(updateWatcherSummaries(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    game.id,
    playerGame as GameMarkSummary,
  ));
  if (game.tournament !== undefined) {
    work.push(tournamentUpdates(game, players, player));
  }
  work.push(enqueueGameEndNotifications(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    toNotificationGame(
      game,
      collectGameEndScoresFromEngine(
        engine,
        flagSetIncludes(effectiveFlags(engine, game.metaGame, game.variants), 'scores'),
      ),
    ),
    inAppSettingsMapFromUsers(players),
  ));
  await Promise.all(work);
  return game;
}
