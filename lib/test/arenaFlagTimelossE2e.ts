import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { ARENA_CLOCK_GRACE_MS } from '../arena/constants.js';
import { nominalArenaFlagAtMs } from '../arena/nominalFlagAt.js';
import { upsertArenaFlagSchedule } from '../arena/flagSchedule.js';
import { ddbDocClient } from '../ddb.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import type { DevTestPlayersManifest } from './devTestPlayers.js';
import { authQueryAsPlayer } from './devTestPlayers.js';

const SERVICE = 'abstract-play';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

export type ArenaFlagTimelossOptions = {
  manifest: DevTestPlayersManifest;
  hostKey?: string;
  opponentKey?: string;
  metaGame?: string;
  tcId?: string;
  tableName?: string;
  stage?: string;
  patchBankMs?: number;
  pollTimeoutMs?: number;
};

export type PatchedArenaTimelossGame = {
  gameId: string;
  metaGame: string;
  onClockPlayerKey: string;
  onClockPlayerIndex: number;
  expectedWinnerSeat: number;
  fireAtMs: number;
};

type GameRow = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  players: { id: string; name?: string; time?: number }[];
  toMove: string | boolean[];
  lastMoveTime: number;
  clockGeneration?: number;
  playMode?: string;
  state: string;
  [key: string]: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function onClockPlayerIndex(toMove: string | boolean[]): number {
  if (Array.isArray(toMove)) {
    const i = toMove.findIndex(Boolean);
    if (i < 0) {
      throw new Error('simultaneous toMove but nobody on clock');
    }
    return i;
  }
  const idx = Number.parseInt(String(toMove), 10);
  if (!Number.isFinite(idx)) {
    throw new Error(`invalid toMove ${String(toMove)}`);
  }
  return idx;
}

async function stackOutput(stage: string, name: string): Promise<string> {
  const cfn = new CloudFormationClient({ region: REGION });
  const stacks = await cfn.send(new DescribeStacksCommand({
    StackName: `${SERVICE}-${stage}`,
  }));
  const outputs = stacks.Stacks?.[0]?.Outputs ?? [];
  const hit = outputs.find((o) => o.OutputKey === name);
  if (!hit?.OutputValue) {
    throw new Error(`Missing stack output ${name} on ${SERVICE}-${stage}`);
  }
  return hit.OutputValue;
}

async function resolveSchedulerArns(stage: string): Promise<{
  workerArn: string;
  schedulerRoleArn: string;
}> {
  return {
    workerArn: process.env.ARENA_FLAG_WORKER_ARN ?? await stackOutput(stage, 'ArenaFlagWorkerArn'),
    schedulerRoleArn: process.env.ARENA_SCHEDULER_ROLE_ARN
      ?? await stackOutput(stage, 'ArenaSchedulerRoleArn'),
  };
}

function resolveOnClockPlayerKey(
  manifest: DevTestPlayersManifest,
  hostKey: string,
  opponentKey: string,
  game: GameRow,
): string {
  const clockIdx = onClockPlayerIndex(game.toMove);
  const onClockUserId = game.players[clockIdx]?.id;
  if (manifest.players[hostKey]?.userId === onClockUserId) {
    return hostKey;
  }
  if (manifest.players[opponentKey]?.userId === onClockUserId) {
    return opponentKey;
  }
  throw new Error(`on-clock user ${onClockUserId} not in manifest keys`);
}

/**
 * Create dev arena game, patch a short bank on the on-clock player, refresh lastMoveTime.
 * Does not reschedule EventBridge (use runArenaFlagTimelossE2e for scheduler path).
 */
export async function patchArenaDevGameForTimeloss(
  opts: ArenaFlagTimelossOptions,
): Promise<PatchedArenaTimelossGame> {
  const hostKey = opts.hostKey ?? 't1';
  const opponentKey = opts.opponentKey ?? 't2';
  const metaGame = opts.metaGame ?? 'hex';
  const tcId = opts.tcId ?? 'blitz_5_3';
  const stage = opts.stage ?? process.env.WEBSOCKET_STAGE ?? 'dev';
  const tableName = opts.tableName ?? process.env.ABSTRACT_PLAY_TABLE ?? `abstract-play-${stage}`;
  const patchBankMs = opts.patchBankMs ?? Number.parseInt(process.env.AP_ARENA_FLAG_BANK_MS ?? '800', 10);

  process.env.ABSTRACT_PLAY_TABLE = tableName;
  process.env.WEBSOCKET_STAGE = stage;

  const hostPlayer = opts.manifest.players[hostKey];
  const oppPlayer = opts.manifest.players[opponentKey];
  if (!hostPlayer?.refreshToken && !hostPlayer?.idToken) {
    throw new Error(`${hostKey} needs refreshToken in dev-test-players.json`);
  }
  if (!oppPlayer?.userId) {
    throw new Error(`${opponentKey} needs userId in manifest`);
  }

  const create = await authQueryAsPlayer(opts.manifest, hostKey, 'create_arena_dev_game', {
    metaGame,
    tcId,
    opponentId: oppPlayer.userId,
  });
  if (!create.ok) {
    throw new Error(create.message);
  }
  const created = create.data as { gameId: string; metaGame?: string };
  const gameId = created.gameId;
  const meta = created.metaGame ?? metaGame;

  const sk = `${meta}#0#${gameId}`;
  const getRes = await ddbDocClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk },
  }));
  if (!getRes.Item) {
    throw new Error(`GAME row missing: ${sk}`);
  }
  const game = hydrateGameState(getRes.Item as GameRow) as GameRow;
  const clockIdx = onClockPlayerIndex(game.toMove);
  const opponentIdx = clockIdx === 0 ? 1 : 0;
  const expectedWinnerSeat = opponentIdx + 1;

  const lastMoveTime = Date.now();
  const nextGen = (game.clockGeneration ?? 1) + 1;
  game.players = game.players.map((p, i) => ({
    ...p,
    time: i === clockIdx ? patchBankMs : (p.time ?? 0),
  }));
  game.lastMoveTime = lastMoveTime;
  game.clockGeneration = nextGen;

  await ddbDocClient.send(new PutCommand({
    TableName: tableName,
    Item: prepareGameStateForStorage(game as { state: string }),
  }));

  const nominal = nominalArenaFlagAtMs({
    players: game.players,
    toMove: game.toMove,
    lastMoveTime,
  });
  if (nominal === null) {
    throw new Error('nominalArenaFlagAtMs returned null after patch');
  }

  const onClockPlayerKey = resolveOnClockPlayerKey(
    opts.manifest,
    hostKey,
    opponentKey,
    game,
  );

  return {
    gameId,
    metaGame: meta,
    onClockPlayerKey,
    onClockPlayerIndex: clockIdx,
    expectedWinnerSeat,
    fireAtMs: nominal + ARENA_CLOCK_GRACE_MS,
  };
}

/** Participant timeloss(check) without scheduler — mirrors front play-shell poll backup. */
export async function runArenaParticipantTimelossCheckE2e(
  opts: ArenaFlagTimelossOptions,
): Promise<{ gameId: string; metaGame: string; winnerSeats: number[] }> {
  const pollTimeoutMs = opts.pollTimeoutMs ?? 60_000;
  const patched = await patchArenaDevGameForTimeloss(opts);
  const { gameId, metaGame, onClockPlayerKey, expectedWinnerSeat, fireAtMs } = patched;

  const waitMs = Math.max(0, patched.fireAtMs + 500 - Date.now());
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const pollDeadline = Date.now() + pollTimeoutMs;
  let ended = false;
  while (Date.now() < pollDeadline) {
    const tl = await authQueryAsPlayer(opts.manifest, onClockPlayerKey, 'timeloss', {
      id: gameId,
      metaGame,
    });
    if (!tl.ok) {
      throw new Error(tl.message);
    }
    if (tl.data !== 'not_a_timeloss') {
      ended = true;
      break;
    }
    await sleep(500);
  }
  if (!ended) {
    throw new Error('timeloss(check) returned not_a_timeloss after clock expiry');
  }

  const deadline = Date.now() + pollTimeoutMs;
  let winnerSeats: number[] = [];
  while (Date.now() < deadline) {
    const r = await authQueryAsPlayer(opts.manifest, onClockPlayerKey, 'get_game', {
      id: gameId,
      metaGame,
      cbit: 0,
    });
    if (!r.ok) {
      throw new Error(r.message);
    }
    const g = (r.data as { game?: {
      toMove?: string;
      gameEnded?: number;
      winner?: number[];
    } }).game;
    if (g && (g.toMove === '' || g.toMove == null || g.gameEnded !== undefined)) {
      winnerSeats = g.winner ?? [];
      if (!winnerSeats.includes(expectedWinnerSeat)) {
        throw new Error(
          `timeloss winner expected seat ${expectedWinnerSeat}, got ${JSON.stringify(winnerSeats)}`,
        );
      }
      break;
    }
    await sleep(1500);
  }
  if (winnerSeats.length === 0) {
    throw new Error('Game did not end after participant timeloss(check)');
  }

  return { gameId, metaGame, winnerSeats };
}

/** S1: patch short bank, reschedule flag, assert worker timeloss + dashboard exclusion. */
export async function runArenaFlagTimelossE2e(
  opts: ArenaFlagTimelossOptions,
): Promise<{ gameId: string; metaGame: string; winnerSeats: number[] }> {
  const hostKey = opts.hostKey ?? 't1';
  const opponentKey = opts.opponentKey ?? 't2';
  const stage = opts.stage ?? process.env.WEBSOCKET_STAGE ?? 'dev';
  const pollTimeoutMs = opts.pollTimeoutMs ?? 120_000;

  const patched = await patchArenaDevGameForTimeloss(opts);
  const { gameId, metaGame, expectedWinnerSeat, fireAtMs } = patched;

  const sk = `${metaGame}#0#${gameId}`;
  const tableName = process.env.ABSTRACT_PLAY_TABLE ?? `abstract-play-${stage}`;
  const getRes = await ddbDocClient.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk },
  }));
  const game = hydrateGameState(getRes!.Item as GameRow) as GameRow;
  const lastMoveTime = game.lastMoveTime;
  const nextGen = game.clockGeneration ?? 1;

  const nominal = nominalArenaFlagAtMs({
    players: game.players,
    toMove: game.toMove,
    lastMoveTime,
  });
  if (nominal === null) {
    throw new Error('nominalArenaFlagAtMs returned null after patch');
  }

  const { workerArn, schedulerRoleArn } = await resolveSchedulerArns(stage);
  const scheduler = new SchedulerClient({ region: REGION });
  await upsertArenaFlagSchedule({
    stage,
    workerArn,
    schedulerRoleArn,
    payload: { metaGame, gameId, clockGeneration: nextGen },
    nominalFlagAtMs: nominal,
  }, scheduler);

  const deadline = Date.now() + pollTimeoutMs;
  let winnerSeats: number[] = [];
  while (Date.now() < deadline) {
    if (Date.now() < fireAtMs + 500) {
      await sleep(500);
      continue;
    }
    const r = await authQueryAsPlayer(opts.manifest, hostKey, 'get_game', {
      id: gameId,
      metaGame,
      cbit: 0,
    });
    if (!r.ok) {
      throw new Error(r.message);
    }
    const g = (r.data as { game?: {
      toMove?: string;
      gameEnded?: number;
      winner?: number[];
    } }).game;
    if (g && (g.toMove === '' || g.toMove == null || g.gameEnded !== undefined)) {
      winnerSeats = g.winner ?? [];
      if (!winnerSeats.includes(expectedWinnerSeat)) {
        throw new Error(
          `timeloss winner expected seat ${expectedWinnerSeat}, got ${JSON.stringify(winnerSeats)}`,
        );
      }
      break;
    }
    await sleep(2000);
  }
  if (winnerSeats.length === 0) {
    throw new Error('Game did not end within poll window after scheduled flag');
  }

  const dash = await authQueryAsPlayer(opts.manifest, hostKey, 'me_dashboard', {
    vars: ['myMove', 'waiting', 'currentGames'],
  });
  if (!dash.ok) {
    throw new Error(dash.message);
  }
  const d = dash.data as {
    myMove?: { id?: string }[];
    waiting?: { id?: string }[];
    currentGames?: { id?: string }[];
  };
  const onDash = [d.myMove, d.waiting, d.currentGames]
    .flat()
    .some((g) => g?.id === gameId);
  if (onDash) {
    throw new Error(`arena game ${gameId} still on me_dashboard after timeloss`);
  }

  return { gameId, metaGame, winnerSeats };
}
