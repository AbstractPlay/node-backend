/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type GetCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  GameFactory,
  GameBaseSimultaneous,
} from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { effectiveFlags, flagSetIncludes, structuralFlags } from '../effectiveGameFlags.js';
import {
  hydrateGameState,
  prepareGameStateForStorage,
  setGameEndedFromEngine,
} from '../gameState.js';
import { isArenaGame } from '../gamePlayMode.js';
import { wsBroadcast } from '../wsBroadcast.js';
import { getParticipants } from '../participants.js';
import { realPingBot } from '../bots/realPingBot.js';
import {
  collectGameEndScoresFromEngine,
  enqueueGameEndNotifications,
  inAppSettingsMapFromUsers,
} from '../notifications.js';
import { updateWatcherSummaries, type GameMarkSummary } from '../playerGameMarks.js';
import { applyArenaMoveClock } from './applyArenaMoveClock.js';
import { isArenaMoveOutOfTime } from './arenaOutOfTime.js';
import { isArenaCompetitiveClockLive } from './arenaEffectiveClock.js';
import { ARENA_CLOCK_GRACE_MS } from './constants.js';
import { deleteArenaFlagForGame, rescheduleArenaFlagForGame } from './rescheduleArenaFlag.js';
import { finishArenaTableOnGameEnd } from './table/tableMutations.js';
import { publishArenaMoveMetrics } from './arenaMoveMetrics.js';
import { getArenaTimeControl } from './timeControls.js';
import {
  applyMove,
  applySimultaneousMove,
  drawaccepted,
  resign,
  timeout,
} from '../games/playHandlers.js';

type ArenaFullGame = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  state: string;
  players: { id: string; name: string; time?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
  clockHard: boolean;
  clockGeneration?: number;
  arenaClock?: { startSec: number; incSec: number; maxSec: number };
  arenaTcId?: string;
  playMode?: string;
  partialMove?: string;
  gameEnded?: number;
  winner?: number[];
  numMoves?: number;
  variants?: string[];
  noExplore?: boolean;
  gameStarted?: number;
  arenaClockStartAt?: number;
  arenaPlayReady?: string[];
  rated?: boolean;
};

function gameRefLabel(metaGame: string, id: string): string {
  return `${metaGame} ${id}`;
}

function logArenaMoveTiming(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ arenaMoveTiming: fields }));
}

function isNonSimultaneousGameOver(game: ArenaFullGame): boolean {
  if (game.gameEnded !== undefined) {
    return true;
  }
  return game.toMove === '' || game.toMove === null;
}

export async function submitArenaMove(
  userid: string,
  pars: {
    id: string;
    move: string;
    draw?: string;
    metaGame: string;
    cbit: number;
    moveNumber?: number;
    moveSentAt?: number;
  },
) {
  const moveReceivedAt = Date.now();
  const gameLoadedAt = moveReceivedAt;

  if (pars.cbit !== 0) {
    return formatReturnError('cbit must be 0');
  }

  let data: GetCommandOutput;
  try {
    data = await sendCommandWithRetry<GetCommandOutput>(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: 'GAME',
          sk: `${pars.metaGame}#0#${pars.id}`,
        },
      }),
    );
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(
      `Unable to load game (${gameRefLabel(pars.metaGame, pars.id)}).`,
      error,
    );
  }

  if (!data.Item) {
    return formatReturnError(
      `Game not found (${gameRefLabel(pars.metaGame, pars.id)}).`,
    );
  }

  const game = hydrateGameState(data.Item as ArenaFullGame) as ArenaFullGame;
  if (!isArenaGame(game)) {
    return formatReturnError('Not an arena game.');
  }
  if (!game.arenaClock) {
    return formatReturnError('Arena game missing arenaClock.');
  }

  if (
    pars.move !== 'resign'
    && pars.move !== 'timeout'
    && !(pars.move === '' && pars.draw === 'drawaccepted')
    && !isArenaCompetitiveClockLive(game, moveReceivedAt)
  ) {
    return formatReturnError('The game clock has not started yet.');
  }

  const flagsEarly = structuralFlags(game.metaGame);
  const simultaneousEarly = flagSetIncludes(flagsEarly, 'simultaneous');
  if (!simultaneousEarly && isNonSimultaneousGameOver(game)) {
    return formatReturnError(
      `This game has ended (${gameRefLabel(pars.metaGame, pars.id)}).`,
    );
  }

  if (
    pars.move !== 'resign'
    && pars.move !== 'timeout'
    && !(pars.move === '' && pars.draw === 'drawaccepted')
    && isArenaMoveOutOfTime(
      {
        players: game.players,
        toMove: game.toMove,
        lastMoveTime: game.lastMoveTime,
        arenaClockStartAt: game.arenaClockStartAt,
      },
      userid,
      moveReceivedAt,
    )
  ) {
    logArenaMoveTiming({
      metaGame: pars.metaGame,
      gameId: pars.id,
      arenaTcId: game.arenaTcId,
      moveReceivedAt,
      ootRejected: true,
    });
    await publishArenaMoveMetrics({
      arenaTcId: game.arenaTcId,
      ootRejected: true,
    });
    return formatReturnError(
      `Move arrived after the clock expired (grace ${ARENA_CLOCK_GRACE_MS}ms).`,
    );
  }

  const engine = GameFactory(game.metaGame, game.state);
  if (!engine) {
    return formatReturnError(`Unknown game type (${gameRefLabel(pars.metaGame, pars.id)}).`);
  }

  const currentMoveNumber = engine.stack.length;
  if (pars.moveNumber !== undefined && pars.moveNumber !== currentMoveNumber) {
    return formatReturnError(
      `Move number mismatch: browser has ${pars.moveNumber} moves but game has ${currentMoveNumber} moves. Please refresh your browser.`,
    );
  }

  const flags = structuralFlags(game.metaGame);
  const simultaneous = flagSetIncludes(flags, 'simultaneous');
  const sessionFlags = effectiveFlags(engine, game.metaGame, game.variants);
  const prevLastMoveTime = game.lastMoveTime;
  let autoMovesPerPlayer: number[] = [];
  const list: Promise<any>[] = [];

  const noopVacation = () => null;

  try {
    if (pars.move === 'resign') {
      resign(userid, engine, game as any);
    } else if (pars.move === 'timeout') {
      timeout(userid, engine, game as any, moveReceivedAt, noopVacation);
    } else if (pars.move === '' && pars.draw === 'drawaccepted') {
      drawaccepted(userid, engine, game as any, simultaneous);
    } else if (simultaneous) {
      applySimultaneousMove(userid, pars.move, engine as GameBaseSimultaneous, game as any);
    } else {
      const result = applyMove(
        userid,
        pars.move,
        currentMoveNumber,
        engine,
        game as any,
        [...sessionFlags],
        null,
        null,
      );
      autoMovesPerPlayer = result.autoMovesPerPlayer;
      for (const workItem of result.work) {
        list.push(workItem);
      }
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to apply move ${pars.move}`, error);
  }

  const engineDoneAt = Date.now();

  if (
    pars.move !== 'resign'
    && pars.move !== 'timeout'
    && !(pars.move === '' && pars.draw === 'drawaccepted')
  ) {
    const clockResult = applyArenaMoveClock({
      moveReceivedAt,
      prevLastMoveTime,
      submitterId: userid,
      players: game.players,
      toMoveAfterMove: game.toMove,
      arenaClock: game.arenaClock,
      autoMovesPerPlayer,
    });
    game.players = clockResult.players.map((p, i) => ({
      ...game.players[i]!,
      time: p.time,
    }));
    game.lastMoveTime = clockResult.lastMoveTime;
  } else {
    game.lastMoveTime = moveReceivedAt;
  }

  game.clockGeneration = (game.clockGeneration ?? 1) + 1;

  setGameEndedFromEngine(game as any, engine);
  game.numMoves = engine.stack.length - 1;

  if (game.toMove === '' || game.toMove === null) {
    list.push(sendCommandWithRetry(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { pk: 'GAME', sk: game.sk },
      }),
    ));
    game.sk = `${game.metaGame}#1#${game.id}`;
    const playerIDs = game.players.map((p) => p.id);
    const players = await getParticipants(playerIDs);
    const endScores = collectGameEndScoresFromEngine(
      engine,
      flagSetIncludes(sessionFlags, 'scores'),
    );
    list.push(enqueueGameEndNotifications(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      {
        id: game.id,
        metaGame: game.metaGame,
        variants: engine.variants,
        players: game.players.map((p) => ({ id: p.id, name: p.name })),
        winner: game.winner,
        ...(endScores && endScores.length > 0 ? { scores: endScores } : {}),
      },
      inAppSettingsMapFromUsers(players),
    ));
  }

  list.push(sendCommandWithRetry(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: prepareGameStateForStorage(game as any),
  })));

  const playerGame = {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    lastMoveTime: game.lastMoveTime,
    numMoves: game.numMoves,
    gameStarted: game.gameStarted ?? moveReceivedAt,
    variants: engine.variants,
    gameEnded: game.gameEnded,
    winner: game.winner,
    toMove: game.toMove,
  } as GameMarkSummary;

  list.push(updateWatcherSummaries(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    game.id,
    playerGame,
  ));

  await Promise.all(list);

  if (game.gameEnded !== undefined && isArenaGame(game)) {
    await finishArenaTableOnGameEnd(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      game.id,
    );
  }

  const clockCommittedAt = Date.now();

  if (game.gameEnded !== undefined) {
    await deleteArenaFlagForGame(game.id);
  } else {
    await rescheduleArenaFlagForGame({
      id: game.id,
      metaGame: game.metaGame,
      clockGeneration: game.clockGeneration,
      players: game.players,
      toMove: game.toMove,
      lastMoveTime: game.lastMoveTime,
    });
  }

  await realPingBot(game.metaGame, game.id, game as any);
  await wsBroadcast('game', { meta: pars.metaGame, id: pars.id }, [userid]);

  const submitter = game.players.find((p) => p.id === userid);
  const processingMs = clockCommittedAt - moveReceivedAt;
  logArenaMoveTiming({
    metaGame: pars.metaGame,
    gameId: pars.id,
    arenaTcId: game.arenaTcId,
    tier: game.arenaTcId ? getArenaTimeControl(game.arenaTcId)?.tier : undefined,
    userId: userid,
    moveReceivedAt,
    gameLoadedAt,
    engineDoneAt,
    clockCommittedAt,
    processingMs,
    timeUsedMs: moveReceivedAt - prevLastMoveTime,
    bankAfterMs: submitter?.time,
    clockGeneration: game.clockGeneration,
    moveSentAt: pars.moveSentAt,
    ootRejected: false,
  });
  await publishArenaMoveMetrics({
    arenaTcId: game.arenaTcId,
    processingMs,
    ootRejected: false,
  });

  if (game.gameEnded === undefined && game.toMove) {
    (game as ArenaFullGame & { clockDisplayServerTime?: number }).clockDisplayServerTime =
      clockCommittedAt;
  }

  return {
    statusCode: 200,
    body: JSON.stringify(game),
    headers,
  };
}
