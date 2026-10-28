#!/usr/bin/env npx tsx
/**
 * S1 live dev smoke — dev-test-players.json + authQuery (+ public query).
 *
 *   npx tsx scripts/arena-dev-smoke.ts
 */
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';
import { DEV_AUTH_QUERY_URL } from '../lib/test/devStageConfig.js';

type StepResult = { name: string; ok: boolean; detail?: string };

const META_GAME = process.env.AP_ARENA_SMOKE_META ?? 'hex';
const TC_ID = process.env.AP_ARENA_SMOKE_TC ?? 'blitz_5_3';
const HOST = (process.env.AP_ARENA_SMOKE_HOST ?? 't1') as string;
const OPPONENT = (process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2') as string;

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

async function step(name: string, fn: () => Promise<void>): Promise<StepResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, ok: false, detail };
  }
}

function publicQueryUrl(): string {
  return process.env.AP_PUBLIC_QUERY_URL
    ?? DEV_AUTH_QUERY_URL.replace(/\/authQuery\/?$/, '/query');
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  const hostPlayer = manifest.players[HOST];
  const oppPlayer = manifest.players[OPPONENT];
  assert(hostPlayer?.refreshToken || hostPlayer?.idToken, `${HOST} needs refreshToken`);
  assert(oppPlayer?.userId, `${OPPONENT} needs userId in manifest`);
  const opponentId = oppPlayer!.userId!;

  const results: StepResult[] = [];
  let gameId: string | undefined;
  let metaGame = META_GAME;

  results.push(await step(`${HOST} — Cognito refresh + me_profile`, async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'me_profile', {});
    assert(r.ok, !r.ok ? r.message : 'me_profile failed');
  }));

  results.push(await step('public list_arena_time_controls', async () => {
    const res = await fetch(publicQueryUrl(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'list_arena_time_controls', pars: {} }),
    });
    const text = await res.text();
    assert(res.ok, text || res.statusText);
    const envelope = JSON.parse(text) as { statusCode?: number; body?: string };
    const body = typeof envelope.body === 'string'
      ? JSON.parse(envelope.body) as { controls?: { id: string }[] }
      : envelope as { controls?: { id: string }[] };
    const ids = (body.controls ?? []).map((t) => t.id);
    assert(ids.includes(TC_ID), `missing ${TC_ID} in catalog: ${ids.join(', ')}`);
  }));

  results.push(await step(`create_arena_dev_game (${HOST} vs ${OPPONENT})`, async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'create_arena_dev_game', {
      metaGame: META_GAME,
      tcId: TC_ID,
      opponentId,
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
    const data = r.data as { gameId?: string; metaGame?: string; playMode?: string };
    assert(data.gameId, 'no gameId in response');
    assert(data.playMode === 'arena', `playMode=${data.playMode}`);
    gameId = data.gameId;
    metaGame = data.metaGame ?? META_GAME;
  }));

  assert(gameId, 'game not created');

  results.push(await step('get_game — arena clock + playMode', async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'get_game', {
      id: gameId,
      metaGame,
      cbit: 0,
    });
    assert(r.ok, !r.ok ? r.message : 'get_game failed');
    const data = r.data as { game?: {
      playMode?: string;
      arenaTcId?: string;
      arenaClock?: { startSec: number };
      toMove?: string;
    } };
    const game = data.game;
    assert(game, 'get_game body missing game');
    assert(game.playMode === 'arena', `playMode=${game.playMode}`);
    assert(game.arenaTcId === TC_ID, `arenaTcId=${game.arenaTcId}`);
    assert(game.arenaClock?.startSec, 'missing arenaClock');
    assert(game.toMove !== '' && game.toMove != null, 'game already over');
  }));

  results.push(await step('submit_move rejected on arena game', async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'submit_move', {
      id: gameId,
      metaGame,
      cbit: 0,
      move: 'resign',
    });
    assert(!r.ok, 'submit_move should fail on arena');
    assert(
      r.message.includes('submit_arena_move') || r.statusCode === 400,
      r.message,
    );
  }));

  results.push(await step('submit_arena_move — resign ends game', async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'submit_arena_move', {
      id: gameId,
      metaGame,
      cbit: 0,
      move: 'resign',
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
  }));

  results.push(await step('get_game — finished (no active toMove)', async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'get_game', {
      id: gameId,
      metaGame,
      cbit: 0,
    });
    assert(r.ok, !r.ok ? r.message : 'get_game failed');
    const data = r.data as { game?: { toMove?: string; gameEnded?: number; winner?: number[] } };
    const game = data.game;
    assert(game, 'get_game body missing game');
    assert(game.toMove === '' || game.toMove == null, `still active toMove=${game.toMove}`);
    assert(game.gameEnded !== undefined || (game.winner?.length ?? 0) > 0, 'game not marked ended');
  }));

  results.push(await step(`${HOST} me_dashboard — arena game not in correspondence lists`, async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'me_dashboard', {
      vars: ['myMove', 'waiting', 'currentGames'],
    });
    assert(r.ok, !r.ok ? r.message : 'me_dashboard failed');
    const data = r.data as {
      myMove?: { id?: string }[];
      waiting?: { id?: string }[];
      currentGames?: { id?: string }[];
    };
    const inMyMove = (data.myMove ?? []).some((g) => g.id === gameId);
    const inWaiting = (data.waiting ?? []).some((g) => g.id === gameId);
    const inCurrent = (data.currentGames ?? []).some((g) => g.id === gameId);
    assert(!inMyMove && !inWaiting && !inCurrent, `arena game ${gameId} appeared on dashboard`);
  }));

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed (gameId=${gameId})`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
