import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  GameFactory,
  type GameBase,
  type IGamePly,
  trailingSameActorRun,
  targetStackLengthBeforeTrailingRun,
  teachingPlyWalkSupported,
  type TrailingSameActorRun,
} from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { headers, formatReturnError } from '../api/http.js';
import { flagSetIncludes, structuralFlags } from '../effectiveGameFlags.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { updateWatcherSummaries, type GameMarkSummary } from '../playerGameMarks.js';
import { realPingBot } from '../bots/realPingBot.js';
import { wsBroadcast } from '../wsBroadcast.js';

export type { TrailingSameActorRun } from '@abstractplay/gameslib';

export type TeachingUndo = {
  grantorSeat: number;
  reviewerSeat: number;
  stackAtGrant: number;
  grantorSeatAfterKeep: number;
};

export type TeachingPlyStart = {
  stackIndex: number;
  playerTimes: number[];
  lastMoveTime: number;
};

export type TeachingGameRow = {
  state: string;
  variants?: string[];
  metaGame: string;
  id: string;
  teachingMode?: boolean;
  teachingUndo?: TeachingUndo;
  teachingPlyStart?: TeachingPlyStart;
};

export type TeachingPlayGame = TeachingGameRow & {
  pk: string;
  sk: string;
  numPlayers: number;
  clockHard: boolean;
  noExplore?: boolean;
  players: Array<{ id: string; name?: string; time?: number }>;
  toMove: string | boolean[];
  lastMoveTime: number;
  numMoves?: number;
  winner?: number[];
};

type TeachingRpcPars = { id: string; metaGame: string; cbit: number };

type EngineWithPlies = GameBase & {
  getPlies?: () => IGamePly[];
};

export function enginePlies(engine: GameBase): IGamePly[] {
  const withPlies = engine as EngineWithPlies;
  if (typeof withPlies.getPlies === 'function') {
    return withPlies.getPlies();
  }
  const plies: IGamePly[] = [];
  for (let i = 1; i < engine.stack.length; i++) {
    const prev = engine.stack[i - 1] as { currplayer?: number };
    const actor = typeof prev.currplayer === 'number' ? prev.currplayer : 1;
    plies.push({
      stackIndex: i,
      actor,
      move: '',
      results: [],
      round: 0,
      playOrder: i,
    });
  }
  return plies;
}

/** Actor (1-based seat) of the latest completed ply, or null if none. */
export function lastPlyActor(engine: GameBase): number | null {
  const plies = enginePlies(engine);
  if (plies.length === 0) {
    return null;
  }
  return plies[plies.length - 1].actor;
}

export { trailingSameActorRun, teachingPlyWalkSupported };

export function targetStackLengthForUndo(run: TrailingSameActorRun): number {
  return targetStackLengthBeforeTrailingRun(run);
}

export function undoTargetStackLengthForReviewer(
  engine: GameBase,
  reviewerActor1Based: number,
): number | null {
  const plies = enginePlies(engine);
  if (!teachingPlyWalkSupported(plies)) {
    return null;
  }
  const run = trailingSameActorRun(plies, reviewerActor1Based);
  if (!run) {
    return null;
  }
  return targetStackLengthForUndo(run);
}

/** 0-based seat of the reviewer (last ply actor) when grantor is on turn; null if illegal. */
export function teachingReviewerSeat0(
  engine: GameBase,
  grantorSeat0: number,
): number | null {
  const actor1 = lastPlyActor(engine);
  if (actor1 === null) {
    return null;
  }
  const reviewer0 = actor1 - 1;
  if (reviewer0 < 0 || reviewer0 === grantorSeat0) {
    return null;
  }
  return reviewer0;
}

/**
 * When false, the current human submit continues the same seat's sequenced batch —
 * keep the existing `teachingPlyStart` anchor.
 */
export function shouldRefreshPlyStart(
  plies: IGamePly[],
  toMoveSeat0Based: number,
): boolean {
  if (plies.length === 0) {
    return true;
  }
  const lastActor1 = plies[plies.length - 1].actor;
  return lastActor1 !== toMoveSeat0Based + 1;
}

export function shouldRefreshPlyStartForEngine(
  engine: GameBase,
  toMoveSeat0Based: number,
): boolean {
  return shouldRefreshPlyStart(enginePlies(engine), toMoveSeat0Based);
}

export function rollbackEngineToStackLength(engine: GameBase, targetLen: number): void {
  if (targetLen < 1 || targetLen > engine.stack.length) {
    throw new Error(`Invalid teaching rollback target length ${targetLen}`);
  }
  while (engine.stack.length > targetLen) {
    engine.undo();
  }
}

export function captureTeachingPlyStart(
  game: { players: Array<{ time?: number }>; lastMoveTime: number },
  engine: GameBase,
): TeachingPlyStart {
  return {
    stackIndex: engine.stack.length,
    playerTimes: game.players.map((p) => p.time ?? 0),
    lastMoveTime: game.lastMoveTime,
  };
}

export function restoreTeachingClocks<
  T extends { players: Array<{ time?: number }>; lastMoveTime: number },
>(game: T, snapshot: TeachingPlyStart): void {
  if (game.players.length !== snapshot.playerTimes.length) {
    throw new Error('Teaching clock restore: player count mismatch');
  }
  for (let i = 0; i < game.players.length; i++) {
    game.players[i].time = snapshot.playerTimes[i];
  }
  game.lastMoveTime = snapshot.lastMoveTime;
}

export async function trimExplorationAfterStack(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  fromMoveIndexInclusive: number,
): Promise<void> {
  const data = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `GAMEEXPLORATION#${gameId}` },
    }),
  );
  const toDelete = (data.Items ?? []).filter((item) => {
    const move = item.move;
    return typeof move === 'number' && move >= fromMoveIndexInclusive;
  });
  for (let i = 0; i < toDelete.length; i += 25) {
    const chunk = toDelete.slice(i, i + 25);
    if (chunk.length === 0) {
      continue;
    }
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            DeleteRequest: {
              Key: { pk: item.pk, sk: item.sk },
            },
          })),
        },
      }),
    );
  }
}

export type LoadedTeachingGame =
  | { ok: true; game: TeachingPlayGame }
  | { ok: false; reason: 'not_found' | 'completed' | 'load_error'; message: string };

export async function loadInProgressGameForTeaching(
  metaGame: string,
  id: string,
  client: DynamoDBDocumentClient = ddbDocClient,
): Promise<LoadedTeachingGame> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    return {
      ok: false,
      reason: 'load_error',
      message: 'ABSTRACT_PLAY_TABLE is not configured',
    };
  }
  const sk = `${metaGame}#0#${id}`;
  try {
    const inProgress = await sendCommandWithRetry(
      new GetCommand({
        TableName: tableName,
        Key: { pk: 'GAME', sk },
      }),
    );
    if (inProgress.Item) {
      return {
        ok: true,
        game: hydrateGameState(inProgress.Item as TeachingPlayGame),
      };
    }
    const completed = await sendCommandWithRetry(
      new GetCommand({
        TableName: tableName,
        Key: { pk: 'GAME', sk: `${metaGame}#1#${id}` },
      }),
    );
    if (completed.Item) {
      return {
        ok: false,
        reason: 'completed',
        message: `This game has ended (${metaGame}, ${id}).`,
      };
    }
    return {
      ok: false,
      reason: 'not_found',
      message: `Game not found (${metaGame}, ${id}).`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: 'load_error',
      message: `Unable to load game (${metaGame}, ${id}): ${detail}`,
    };
  }
}

export function hydrateTeachingEngine(
  game: Pick<TeachingGameRow, 'metaGame' | 'state'>,
): GameBase | undefined {
  return GameFactory(game.metaGame, game.state) as GameBase | undefined;
}

export function playerSeat0(
  game: Pick<TeachingPlayGame, 'players'>,
  userid: string,
): number | null {
  const idx = game.players.findIndex((p) => p.id === userid);
  return idx >= 0 ? idx : null;
}

export const TEACHING_REVIEW_PLAY_BLOCKED_MESSAGE =
  'Finish teaching review (keep or undo) before playing.';

export const TEACHING_PIE_BLOCKED_MESSAGE =
  'Seat swapping is not available in teaching mode games.';

/** While `teachingUndo` is set, only `teaching_keep_move` / `teaching_undo_move` apply. */
export function teachingReviewBlocksPlay(
  game: Pick<TeachingPlayGame, 'teachingUndo'>,
): string | null {
  if (game.teachingUndo) {
    return TEACHING_REVIEW_PLAY_BLOCKED_MESSAGE;
  }
  return null;
}

export function teachingModeBlocksPie(
  game: Pick<TeachingPlayGame, 'teachingMode'>,
): string | null {
  if (game.teachingMode === true) {
    return TEACHING_PIE_BLOCKED_MESSAGE;
  }
  return null;
}

export function teachingModePlayGate(
  game: Pick<TeachingPlayGame, 'teachingMode' | 'numPlayers' | 'metaGame'>,
): string | null {
  if (game.teachingMode !== true) {
    return 'This game is not in teaching mode.';
  }
  if (game.numPlayers !== 2) {
    return 'Teaching mode is only for two-player games.';
  }
  if (flagSetIncludes(structuralFlags(game.metaGame), 'simultaneous')) {
    return 'Teaching mode is not available for simultaneous games.';
  }
  return null;
}

export function grantTeachingUndoInPlace(
  game: TeachingPlayGame,
  engine: GameBase,
  grantorSeat0: number,
): string | null {
  const gate = teachingModePlayGate(game);
  if (gate) {
    return gate;
  }
  if (game.teachingUndo) {
    return 'A teaching undo review is already in progress.';
  }
  if (engine.stack.length <= 1) {
    return 'There is no move to revisit.';
  }
  const reviewer0 = teachingReviewerSeat0(engine, grantorSeat0);
  if (reviewer0 === null) {
    return 'You cannot offer an undo at this position.';
  }
  game.teachingUndo = {
    grantorSeat: grantorSeat0,
    reviewerSeat: reviewer0,
    stackAtGrant: engine.stack.length,
    grantorSeatAfterKeep: grantorSeat0,
  };
  game.toMove = `${reviewer0}`;
  return null;
}

export function keepTeachingMoveInPlace(game: TeachingPlayGame): string | null {
  const undo = game.teachingUndo;
  if (!undo) {
    return 'No teaching undo review is in progress.';
  }
  game.toMove = `${undo.grantorSeatAfterKeep}`;
  delete game.teachingUndo;
  return null;
}

export function undoTeachingMoveInPlace(
  game: TeachingPlayGame,
  engine: GameBase,
): string | null {
  const undo = game.teachingUndo;
  if (!undo) {
    return 'No teaching undo review is in progress.';
  }
  const reviewerActor = undo.reviewerSeat + 1;
  const targetLen = undoTargetStackLengthForReviewer(engine, reviewerActor);
  if (targetLen === null) {
    return 'Cannot undo this position.';
  }
  if (game.teachingPlyStart?.stackIndex === targetLen) {
    restoreTeachingClocks(game, game.teachingPlyStart);
  }
  rollbackEngineToStackLength(engine, targetLen);
  game.state = engine.serialize();
  game.numMoves = engine.stack.length - 1;
  delete game.teachingUndo;
  delete game.teachingPlyStart;
  if (engine.gameover) {
    game.toMove = '';
    game.winner = engine.winner;
  } else {
    game.toMove = `${undo.reviewerSeat}`;
  }
  return null;
}

function watcherSummaryFromGame(game: TeachingPlayGame): GameMarkSummary {
  return {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      time: p.time,
    })),
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
    numMoves: game.numMoves,
  };
}

async function persistTeachingGameUpdate(
  game: TeachingPlayGame,
  metaGame: string,
  userid: string,
): Promise<void> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  await sendCommandWithRetry(
    new PutCommand({
      TableName: tableName,
      Item: prepareGameStateForStorage(game),
    }),
  );
  await updateWatcherSummaries(
    ddbDocClient,
    tableName,
    game.id,
    watcherSummaryFromGame(game),
  );
  await wsBroadcast('game', { meta: metaGame, id: game.id }, [userid]);
  await realPingBot(metaGame, game.id, game);
}

async function runTeachingRpc(
  userid: string,
  pars: TeachingRpcPars,
  apply: (
    game: TeachingPlayGame,
    engine: GameBase,
    seat0: number,
  ) => Promise<string | null> | string | null,
): Promise<{ statusCode: number; body: string; headers: typeof headers }> {
  if (pars.cbit !== 0) {
    return formatReturnError('cbit must be 0');
  }
  const loaded = await loadInProgressGameForTeaching(pars.metaGame, pars.id);
  if (!loaded.ok) {
    return formatReturnError(loaded.message);
  }
  const game = loaded.game;
  const seat0 = playerSeat0(game, userid);
  if (seat0 === null) {
    return formatReturnError(
      `You are not a player in this game (${pars.metaGame}, ${pars.id}).`,
    );
  }
  const engine = hydrateTeachingEngine(game);
  if (!engine) {
    return formatReturnError(`Unknown game type (${pars.metaGame}, ${pars.id}).`);
  }
  const err = await apply(game, engine, seat0);
  if (err) {
    return formatReturnError(err);
  }
  await persistTeachingGameUpdate(game, pars.metaGame, userid);
  return {
    statusCode: 200,
    body: JSON.stringify(game),
    headers,
  };
}

export async function teachingGrantUndo(userid: string, pars: TeachingRpcPars) {
  return runTeachingRpc(userid, pars, (game, engine, seat0) => {
    if (game.toMove !== `${seat0}`) {
      return 'It is not your turn.';
    }
    return grantTeachingUndoInPlace(game, engine, seat0);
  });
}

export async function teachingKeepMove(userid: string, pars: TeachingRpcPars) {
  return runTeachingRpc(userid, pars, (game, _engine, seat0) => {
    if (!game.teachingUndo || seat0 !== game.teachingUndo.reviewerSeat) {
      return 'Only the reviewing player can keep the move.';
    }
    return keepTeachingMoveInPlace(game);
  });
}

export async function teachingUndoMove(userid: string, pars: TeachingRpcPars) {
  return runTeachingRpc(userid, pars, async (game, engine, seat0) => {
    if (!game.teachingUndo || seat0 !== game.teachingUndo.reviewerSeat) {
      return 'Only the reviewing player can undo the move.';
    }
    const reviewerActor = game.teachingUndo.reviewerSeat + 1;
    const targetLen = undoTargetStackLengthForReviewer(engine, reviewerActor);
    if (targetLen === null) {
      return 'Cannot undo this position.';
    }
    const err = undoTeachingMoveInPlace(game, engine);
    if (err) {
      return err;
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    await trimExplorationAfterStack(ddbDocClient, tableName, game.id, targetLen);
    return null;
  });
}
