import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { GameBase } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { flagSetIncludes } from '../effectiveGameFlags.js';
import { prepareGameStateForStorage } from '../gameState.js';
import { isArenaGame } from '../gamePlayMode.js';
import { wsBroadcast } from '../wsBroadcast.js';
import { realPingBot } from '../bots/realPingBot.js';
import { updateWatcherSummaries, type GameMarkSummary } from '../playerGameMarks.js';
import {
  applyArenaInvokePieClock,
  refundArenaPieOpponentThinkTime,
} from './applyArenaInvokePieClock.js';
import { rescheduleArenaFlagForGame } from './rescheduleArenaFlag.js';

type ArenaPieGame = {
  id: string;
  metaGame: string;
  sk: string;
  state: string;
  players: { id: string; name: string; time?: number; seat?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
  clockHard: boolean;
  clockGeneration?: number;
  noExplore?: boolean;
  playMode?: string;
  arenaClock?: { startSec: number; incSec: number; maxSec: number };
  pieInvoked?: boolean;
  numMoves?: number;
};

function gameRefLabel(metaGame: string, id: string): string {
  return `${metaGame} ${id}`;
}

export async function handleArenaInvokePie(
  userid: string,
  pars: { id: string; metaGame: string },
  game: ArenaPieGame,
  engine: GameBase,
  flags: string[],
): Promise<{ statusCode: number; body: string; headers: typeof headers }> {
  if (!isArenaGame(game)) {
    return formatReturnError('Not an arena game.');
  }
  if (!game.arenaClock) {
    return formatReturnError(
      `Arena game missing clock (${gameRefLabel(pars.metaGame, pars.id)}).`,
    );
  }

  const player = game.players.find((p) => p.id === userid);
  if (!player) {
    return formatReturnError(
      `You are not a player in this game (${gameRefLabel(pars.metaGame, pars.id)}).`,
    );
  }

  const moveReceivedAt = Date.now();
  const prevLastMoveTime = game.lastMoveTime;
  const opponentBeforeSwap = game.players.find((p) => p.id !== userid);
  if (!opponentBeforeSwap) {
    return formatReturnError(
      `Unable to switch seats (${gameRefLabel(pars.metaGame, pars.id)}).`,
    );
  }

  const pieEven = flagSetIncludes(flags, 'pie-even');

  let { players: clockedPlayers, timeUsedMs } = applyArenaInvokePieClock({
    moveReceivedAt,
    prevLastMoveTime,
    invokerId: userid,
    players: game.players,
    toMove: game.toMove,
    arenaClock: game.arenaClock,
  });

  if (!pieEven) {
    clockedPlayers = refundArenaPieOpponentThinkTime(
      clockedPlayers,
      opponentBeforeSwap.id,
      timeUsedMs,
      game.arenaClock,
    );
  }

  const timeById = new Map(clockedPlayers.map((p) => [p.id, p.time]));
  game.players = [...game.players]
    .map((p) => ({ ...p, time: timeById.get(p.id) ?? p.time }))
    .reverse()
    .map((p, seat) => ({ ...p, seat }));
  game.pieInvoked = true;

  if (pieEven) {
    try {
      engine.move('pass');
      game.state = engine.serialize();
      game.numMoves = engine.state().stack.length - 1;
      game.toMove = `${engine.currplayer! - 1}`;
    } catch (err) {
      logGetItemError(err);
      return formatReturnError('Error passing while invoking "pie-even"');
    }
  } else {
    game.numMoves = engine.state().stack.length - 1;
  }

  game.lastMoveTime = moveReceivedAt;
  game.clockGeneration = (game.clockGeneration ?? 1) + 1;

  const playerGame = {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
    playMode: 'arena' as const,
  } as GameMarkSummary;

  await Promise.all([
    ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game as { state: string }),
    })),
    updateWatcherSummaries(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      game.id,
      playerGame,
    ),
  ]);

  await rescheduleArenaFlagForGame({
    id: game.id,
    metaGame: game.metaGame,
    clockGeneration: game.clockGeneration,
    players: game.players,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
  });

  await realPingBot(pars.metaGame, pars.id, game as Parameters<typeof realPingBot>[2]);
  await wsBroadcast('game', { meta: pars.metaGame, id: pars.id }, [userid]);

  return {
    statusCode: 200,
    body: JSON.stringify(game),
    headers,
  };
}
