import { GameFactory, type GameBase } from '@abstractplay/gameslib';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { deriveGameEndMeta } from '../gameEndMeta.js';
import {
  parseGameSk,
  purgeCompletedGameDashboardIndexes,
  restoreActiveGameDashboardIndexes,
  toCurrentSummary,
  type GameRecord,
} from '../gameProjector.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { isArenaGame } from '../gamePlayMode.js';
import { updateWatcherSummaries, type GameMarkSummary } from '../playerGameMarks.js';

export type ReopenSalvageTier =
  | 'casual'
  | 'rated_casual'
  | 'ladder'
  | 'tournament'
  | 'event'
  | 'arena_skip'
  | 'missing';

export type ReopenTierPolicy = 'rated_casual' | 'casual' | 'any';

export type ReopenFalseTimeoutOptions = {
  /** 1-based seat from incident CSV (`timedOutSeat`) — cross-checks end meta */
  timedOutSeat?: number;
  /** Which salvage tiers may be reopened (default: rated_casual) */
  tierPolicy?: ReopenTierPolicy;
  /** When true, update CURRENTGAMES/COMPLETEDGAMES immediately (default: false — use stream) */
  syncIndexes?: boolean;
  /** Refresh WATCHED# rows for watchers (default: true on apply) */
  syncWatchers?: boolean;
};

export type ReopenFalseTimeoutAudit = {
  gameId: string;
  metaGame: string;
  tier: ReopenSalvageTier;
  completedSk: string;
  activeSk: string;
  gameEndKind: string;
  timedOutSeat: number;
  numMovesBefore: number;
  numMovesAfter: number;
  lastMoveTimeBefore: number;
  lastMoveTimeAfter: number;
  toMove: string | boolean[];
  winnerBefore: number[] | undefined;
};

export type ReopenAssessResult =
  | { ok: true; active: GameRecord; completed: GameRecord; audit: ReopenFalseTimeoutAudit }
  | { ok: false; reason: string };

export function reopenSalvageTier(game: GameRecord | null | undefined): ReopenSalvageTier {
  if (!game) {
    return 'missing';
  }
  if (isArenaGame(game)) {
    return 'arena_skip';
  }
  if (game.tournament) {
    return 'tournament';
  }
  if (game.ladderId) {
    return 'ladder';
  }
  if (game.event) {
    return 'event';
  }
  if (game.rated === true) {
    return 'rated_casual';
  }
  return 'casual';
}

function tierAllowed(tier: ReopenSalvageTier, policy: ReopenTierPolicy): boolean {
  if (policy === 'any') {
    return tier === 'casual' || tier === 'rated_casual';
  }
  if (policy === 'casual') {
    return tier === 'casual';
  }
  return tier === 'rated_casual';
}

type RewoundEngine = {
  engine: GameBase;
  lastMoveTime: number;
  numMoves: number;
  timedOutSeat: number;
};

function rewindTimeoutEndEngine(metaGame: string, state: string): RewoundEngine {
  const engine = GameFactory(metaGame, state);
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  const endMeta = deriveGameEndMeta(metaGame, state);
  if (endMeta?.gameEndKind !== 'timeout') {
    throw new Error(`Game did not end by timeout (got ${endMeta?.gameEndKind ?? 'none'})`);
  }
  if (engine.stack.length < 2) {
    throw new Error('Completed state has no penultimate ply to restore');
  }
  const timedOutSeat = endMeta.gameEndPlayer;
  if (timedOutSeat === undefined) {
    throw new Error('Timeout end meta missing timed-out seat');
  }

  engine.stack.pop();
  engine.load(-1);
  engine.gameover = false;
  engine.winner = [];

  if (engine.gameover) {
    throw new Error('Engine still gameover after rewinding timeout ply');
  }

  const penultimate = engine.stack[engine.stack.length - 1];
  const lastMoveTime = new Date(penultimate._timestamp).getTime();
  const numMoves = engine.stack.length - 1;

  return { engine, lastMoveTime, numMoves, timedOutSeat };
}

function toMoveForTimedOutSeat(timedOutSeat: number, completed: GameRecord): string | boolean[] {
  if (Array.isArray(completed.toMove)) {
    const next = completed.toMove.map(() => false);
    const idx = timedOutSeat - 1;
    if (idx >= 0 && idx < next.length) {
      next[idx] = true;
    }
    return next;
  }
  return String(timedOutSeat - 1);
}

export function assessReopenFalseTimeout(
  completed: GameRecord,
  options: ReopenFalseTimeoutOptions = {},
): ReopenAssessResult {
  const parsed = parseGameSk(completed.sk);
  if (!parsed || parsed.cbit !== '1') {
    return { ok: false, reason: `Expected completed GAME sk (*#1#*), got ${completed.sk}` };
  }
  if (completed.pk !== 'GAME') {
    return { ok: false, reason: `Expected pk GAME, got ${completed.pk}` };
  }

  const tier = reopenSalvageTier(completed);
  const policy = options.tierPolicy ?? 'rated_casual';
  if (!tierAllowed(tier, policy)) {
    return { ok: false, reason: `Salvage tier ${tier} not allowed under policy ${policy}` };
  }

  const hydrated = hydrateGameState(completed) as GameRecord;
  let rewound: RewoundEngine;
  try {
    rewound = rewindTimeoutEndEngine(hydrated.metaGame, hydrated.state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }

  if (options.timedOutSeat !== undefined && options.timedOutSeat !== rewound.timedOutSeat) {
    return {
      ok: false,
      reason: `timedOutSeat mismatch: CSV ${options.timedOutSeat} vs state ${rewound.timedOutSeat}`,
    };
  }

  const activeSk = `${parsed.metaGame}#0#${parsed.gameId}`;
  const {
    winner,
    gameEnded,
    ...rest
  } = hydrated;
  void winner;
  void gameEnded;

  const active: GameRecord = {
    ...rest,
    sk: activeSk,
    state: rewound.engine.serialize(),
    toMove: toMoveForTimedOutSeat(rewound.timedOutSeat, hydrated),
    lastMoveTime: rewound.lastMoveTime,
    numMoves: rewound.numMoves,
  };
  delete (active as { winner?: number[] }).winner;
  delete (active as { gameEnded?: number }).gameEnded;

  const endMeta = deriveGameEndMeta(hydrated.metaGame, hydrated.state)!;

  const audit: ReopenFalseTimeoutAudit = {
    gameId: completed.id,
    metaGame: completed.metaGame,
    tier,
    completedSk: completed.sk,
    activeSk,
    gameEndKind: endMeta.gameEndKind,
    timedOutSeat: rewound.timedOutSeat,
    numMovesBefore: hydrated.numMoves ?? resolveMovesFromState(hydrated),
    numMovesAfter: rewound.numMoves,
    lastMoveTimeBefore: hydrated.lastMoveTime,
    lastMoveTimeAfter: rewound.lastMoveTime,
    toMove: active.toMove,
    winnerBefore: hydrated.winner,
  };

  return { ok: true, active, completed: hydrated, audit };
}

function resolveMovesFromState(game: GameRecord): number {
  try {
    const engine = GameFactory(game.metaGame, game.state);
    if (engine) {
      return engine.stack.length - 1;
    }
  } catch {
    /* ignore */
  }
  return game.numMoves ?? 0;
}

export function completedGameSk(metaGame: string, gameId: string): string {
  return `${metaGame}#1#${gameId}`;
}

export async function loadCompletedGame(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
): Promise<GameRecord | null> {
  const res = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: completedGameSk(metaGame, gameId) },
  }));
  return (res.Item as GameRecord | undefined) ?? null;
}

export type ReopenApplyResult = {
  applied: boolean;
  audit: ReopenFalseTimeoutAudit;
};

export async function applyReopenFalseTimeout(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  assess: Extract<ReopenAssessResult, { ok: true }>,
  options: ReopenFalseTimeoutOptions & { dryRun?: boolean } = {},
): Promise<ReopenApplyResult> {
  if (options.dryRun) {
    return { applied: false, audit: assess.audit };
  }

  const syncIndexes = options.syncIndexes === true;
  const syncWatchers = options.syncWatchers !== false;
  const playerIds = assess.completed.players.map(p => p.id);

  await docClient.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: assess.completed.sk },
  }));

  if (syncIndexes) {
    await purgeCompletedGameDashboardIndexes(
      docClient,
      tableName,
      assess.completed,
      playerIds,
    );
  }

  const item = prepareGameStateForStorage(assess.active);
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));

  if (syncIndexes) {
    await restoreActiveGameDashboardIndexes(docClient, tableName, assess.active);
  }

  if (syncWatchers) {
    const summary = toCurrentSummary(assess.active) as GameMarkSummary;
    await updateWatcherSummaries(docClient, tableName, assess.active.id, summary);
  }

  return { applied: true, audit: assess.audit };
}
