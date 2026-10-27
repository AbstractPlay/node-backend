import {
  DeleteCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { GameFactory } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { logGetItemError } from '../api/http.js';
import { applyTournamentGameEndUpdates } from './tournamentGameEndUpdates.js';
import { runLadderGameEndHook } from '../ladders/gameEndHook.js';
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
import {
  remainingBankMs,
  wouldTimeOut,
  type ClockGameSlice,
} from '../clockElapsed.js';
import { collectOnClockPlayerIds } from '../vacation/load.js';
import {
  getVacationWindowFromMap,
  prepareVacationWindowsForPlayerIds,
} from '../vacation/persist.js';

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
  ladderId?: string;
  division?: number;
  variants?: string[];
  rated?: boolean;
  gameStarted?: number;
  matchLeg?: number;
  clockStart?: number;
  clockInc?: number;
  clockMax?: number;
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
    const now = Date.now();
    const slice: ClockGameSlice = {
      players: game.players,
      toMove: game.toMove,
      lastMoveTime: game.lastMoveTime,
    };
    const onClockIds = collectOnClockPlayerIds(slice);
    const vacationWindows = await prepareVacationWindowsForPlayerIds(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      onClockIds,
      now,
    );
    const getVacationWindow = getVacationWindowFromMap(vacationWindows);
    if (Array.isArray(game.toMove)) {
      let minRemaining = 0;
      let minIndex = -1;
      game.toMove.forEach((p: boolean, i: number) => {
        if (!p) {
          return;
        }
        const onClockPlayer = game.players[i];
        const remaining = remainingBankMs(
          onClockPlayer.time ?? 0,
          game.lastMoveTime,
          now,
          onClockPlayer.id,
          slice,
          getVacationWindow(onClockPlayer.id),
        );
        if (remaining < minRemaining) {
          minRemaining = remaining;
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
      const onClockPlayer = game.players[toMove];
      if (wouldTimeOut({
        bank: onClockPlayer.time ?? 0,
        lastMoveTime: game.lastMoveTime,
        now,
        playerId: onClockPlayer.id,
        game: slice,
        vacationWindow: getVacationWindow(onClockPlayer.id),
      })) {
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
  if (game.ladderId !== undefined) {
    work.push(runLadderGameEndHook({
      id: game.id,
      ladderId: game.ladderId,
      metaGame: game.metaGame,
      variants: game.variants,
      winner: game.winner,
      players: game.players,
      rated: game.rated,
      gameStarted: game.gameStarted,
      gameEnded: game.gameEnded,
      numMoves: game.numMoves,
    }));
  }
  if (game.tournament !== undefined && game.division !== undefined) {
    work.push(applyTournamentGameEndUpdates(
      {
        id: game.id,
        metaGame: game.metaGame,
        variants: game.variants,
        tournament: game.tournament,
        division: game.division,
        winner: game.winner,
        players: game.players,
        matchLeg: game.matchLeg,
        clockStart: game.clockStart,
        clockInc: game.clockInc,
        clockMax: game.clockMax,
      },
      players,
      player,
    ));
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
