#!/usr/bin/env npx tsx
/**
 * S1 dev E2E: EventBridge Scheduler flag → arenaFlagWorker → timeloss.
 *
 * Creates a real arena game, patches the on-clock bank to ~1s in DynamoDB,
 * reschedules the flag, waits for Lambda, asserts game ended via get_game.
 *
 *   AWS_PROFILE=AbstractPlayDev npm run arena-dev-flag-timeloss
 */
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { ARENA_CLOCK_GRACE_MS } from '../lib/arena/constants.js';
import { nominalArenaFlagAtMs } from '../lib/arena/nominalFlagAt.js';
import { upsertArenaFlagSchedule } from '../lib/arena/flagSchedule.js';
import { ddbDocClient } from '../lib/ddb.js';
import { hydrateGameState, prepareGameStateForStorage } from '../lib/gameState.js';
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';

const SERVICE = 'abstract-play';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const STAGE = process.env.WEBSOCKET_STAGE ?? 'dev';
const TABLE = process.env.ABSTRACT_PLAY_TABLE ?? `abstract-play-${STAGE}`;
const META_GAME = process.env.AP_ARENA_SMOKE_META ?? 'hex';
const TC_ID = process.env.AP_ARENA_SMOKE_TC ?? 'blitz_5_3';
const HOST = process.env.AP_ARENA_SMOKE_HOST ?? 't1';
const OPPONENT = process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2';
/** On-clock bank after patch (ms). */
const PATCH_BANK_MS = Number.parseInt(process.env.AP_ARENA_FLAG_BANK_MS ?? '800', 10);

process.env.ABSTRACT_PLAY_TABLE = TABLE;
process.env.WEBSOCKET_STAGE = STAGE;

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

async function stackOutput(name: string): Promise<string> {
  const cfn = new CloudFormationClient({ region: REGION });
  const stacks = await cfn.send(new DescribeStacksCommand({
    StackName: `${SERVICE}-${STAGE}`,
  }));
  const outputs = stacks.Stacks?.[0]?.Outputs ?? [];
  const hit = outputs.find((o) => o.OutputKey === name);
  if (!hit?.OutputValue) {
    throw new Error(`Missing stack output ${name} on ${SERVICE}-${STAGE}`);
  }
  return hit.OutputValue;
}

async function resolveSchedulerArns(): Promise<{ workerArn: string; schedulerRoleArn: string }> {
  return {
    workerArn: process.env.ARENA_FLAG_WORKER_ARN ?? await stackOutput('ArenaFlagWorkerArn'),
    schedulerRoleArn: process.env.ARENA_SCHEDULER_ROLE_ARN
      ?? await stackOutput('ArenaSchedulerRoleArn'),
  };
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  const hostPlayer = manifest.players[HOST];
  const oppPlayer = manifest.players[OPPONENT];
  if (!hostPlayer?.refreshToken && !hostPlayer?.idToken) {
    throw new Error(`${HOST} needs refreshToken in dev-test-players.json`);
  }
  if (!oppPlayer?.userId) {
    throw new Error(`${OPPONENT} needs userId in manifest`);
  }

  console.log(`Creating arena game (${HOST} vs ${OPPONENT}, ${META_GAME}, ${TC_ID})…`);
  const create = await authQueryAsPlayer(manifest, HOST, 'create_arena_dev_game', {
    metaGame: META_GAME,
    tcId: TC_ID,
    opponentId: oppPlayer.userId,
  });
  if (!create.ok) {
    throw new Error(create.message);
  }
  const created = create.data as { gameId: string; metaGame?: string };
  const gameId = created.gameId;
  const metaGame = created.metaGame ?? META_GAME;
  console.log(`gameId=${gameId}`);

  const sk = `${metaGame}#0#${gameId}`;
  const getRes = await ddbDocClient.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: 'GAME', sk },
  }));
  if (!getRes.Item) {
    throw new Error(`GAME row missing: ${sk}`);
  }
  const game = hydrateGameState(getRes.Item as GameRow) as GameRow;
  const clockIdx = onClockPlayerIndex(game.toMove);
  const timedOutUserId = game.players[clockIdx]?.id;
  const opponentIdx = clockIdx === 0 ? 1 : 0;
  const expectedWinnerSeat = opponentIdx + 1;

  const lastMoveTime = Date.now();
  const nextGen = (game.clockGeneration ?? 1) + 1;
  game.players = game.players.map((p, i) => ({
    ...p,
    time: i === clockIdx ? PATCH_BANK_MS : (p.time ?? 0),
  }));
  game.lastMoveTime = lastMoveTime;
  game.clockGeneration = nextGen;

  await ddbDocClient.send(new PutCommand({
    TableName: TABLE,
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

  const { workerArn, schedulerRoleArn } = await resolveSchedulerArns();
  const scheduler = new SchedulerClient({ region: REGION });
  await upsertArenaFlagSchedule({
    stage: STAGE,
    workerArn,
    schedulerRoleArn,
    payload: { metaGame, gameId, clockGeneration: nextGen },
    nominalFlagAtMs: nominal,
  }, scheduler);

  const fireAtMs = nominal + ARENA_CLOCK_GRACE_MS;
  console.log(
    `Patched on-clock seat ${clockIdx} (${timedOutUserId}) bank=${PATCH_BANK_MS}ms; `
    + `clockGeneration=${nextGen}; expect flag worker after ~${new Date(fireAtMs).toISOString()}…`,
  );

  const deadline = Date.now() + 120_000;
  let ended = false;
  let lastBody: unknown;
  while (Date.now() < deadline) {
    if (Date.now() < fireAtMs + 500) {
      await sleep(500);
      continue;
    }
    const r = await authQueryAsPlayer(manifest, HOST, 'get_game', {
      id: gameId,
      metaGame,
      cbit: 0,
    });
    if (!r.ok) {
      throw new Error(r.message);
    }
    lastBody = r.data;
    const g = (r.data as { game?: {
      toMove?: string;
      gameEnded?: number;
      winner?: number[];
    } }).game;
    if (g && (g.toMove === '' || g.toMove == null || g.gameEnded !== undefined)) {
      ended = true;
      const winners = g.winner ?? [];
      if (!winners.includes(expectedWinnerSeat)) {
        throw new Error(
          `timeloss winner expected seat ${expectedWinnerSeat}, got ${JSON.stringify(winners)}`,
        );
      }
      console.log(`PASS  flag → timeloss (winner seats: ${JSON.stringify(winners)})`);
      break;
    }
    await sleep(2000);
  }
  if (!ended) {
    console.error('Last get_game:', JSON.stringify(lastBody, null, 2));
    throw new Error('Game did not end within poll window after scheduled flag');
  }

  const dash = await authQueryAsPlayer(manifest, HOST, 'me_dashboard', {
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
  console.log('PASS  me_dashboard excludes ended arena game');
  console.log(`\nflag → timeloss OK (gameId=${gameId})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
