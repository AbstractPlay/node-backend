#!/usr/bin/env npx tsx
/**
 * S4 contract E2E — same HTTP queries as `front/src/lib/arena/fetchArena.js`
 * against dev API, with response shapes the Arena UI expects.
 *
 *   npm run arena-front-contract-e2e
 */
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';
import { DEV_AUTH_QUERY_URL } from '../lib/test/devStageConfig.js';

const OPEN_URL =
  process.env.AP_PUBLIC_QUERY_URL
  ?? DEV_AUTH_QUERY_URL.replace(/\/authQuery\/?$/, '/query');

const META = process.env.AP_ARENA_SMOKE_META ?? 'hex';
const TC = process.env.AP_ARENA_SMOKE_TC ?? 'blitz_5_3';
const P1 = (process.env.AP_ARENA_SMOKE_HOST ?? 't1') as string;
const P2 = (process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2') as string;
const P3 = (process.env.AP_ARENA_SMOKE_KIBITZ ?? 't3') as string;

type Step = { name: string; ok: boolean; detail?: string };

function assert(c: unknown, msg: string): asserts c {
  if (!c) throw new Error(msg);
}

async function step(name: string, fn: () => Promise<void>): Promise<Step> {
  try {
    await fn();
    return { name, ok: true };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function postPublic(query: string, pars: Record<string, unknown> = {}) {
  const res = await fetch(OPEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, pars }),
  });
  const text = await res.text();
  assert(res.ok, text || res.statusText);
  const envelope = JSON.parse(text) as { body?: string };
  if (typeof envelope.body === 'string') {
    return JSON.parse(envelope.body) as Record<string, unknown>;
  }
  return envelope as Record<string, unknown>;
}

/** Fields ArenaTableLobby + ArenaLanding rely on from get_arena_table. */
function assertTableUiShape(table: Record<string, unknown>, viewerId: string) {
  assert(typeof table.tableId === 'string', 'tableId');
  assert(typeof table.metaGame === 'string', 'metaGame');
  assert(typeof table.state === 'string', 'state');
  assert(typeof table.arenaTcId === 'string', 'arenaTcId');
  assert(Array.isArray(table.seats), 'seats[]');
  assert(table.viewer && typeof table.viewer === 'object', 'viewer');
  const v = table.viewer as { seated?: boolean; isHost?: boolean };
  assert(typeof v.seated === 'boolean', 'viewer.seated');
  assert(typeof v.isHost === 'boolean', 'viewer.isHost');
  if (table.hostId === viewerId) {
    assert(v.isHost === true, 'host should have viewer.isHost');
  }
  if (table.arenaClock) {
    const c = table.arenaClock as { startSec?: number; incSec?: number };
    assert(typeof c.startSec === 'number', 'arenaClock.startSec');
  }
}

/** Mirrors canCommentArenaTableChat for lobby kibitz. */
function lobbyCanComment(
  me: { id: string; admin?: boolean },
  table: Record<string, unknown>,
): boolean {
  if (!me?.id || !table) return false;
  if (me.admin) return true;
  const v = table.viewer as { seated?: boolean } | undefined;
  if (v?.seated) return true;
  const state = table.state as string;
  if (state === 'open' || state === 'seated' || state === 'ended') return true;
  return false;
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  const results: Step[] = [];

  results.push(await step('public list_arena_time_controls (landing)', async () => {
    const data = await postPublic('list_arena_time_controls');
    const controls = data.controls as { id: string; tier?: string }[] | undefined;
    assert(Array.isArray(controls) && controls.length > 0, 'no controls');
    assert(controls.some((c) => c.id === TC), `missing ${TC}`);
  }));

  results.push(await step('public list_arena_tables (landing poll)', async () => {
    const data = await postPublic('list_arena_tables', { metaGame: META, limit: 10 });
    assert(Array.isArray(data.tables), 'tables[]');
  }));

  let tableId: string | undefined;
  results.push(await step('create_arena_table + get_arena_table UI shape (host)', async () => {
    const r = await authQueryAsPlayer(manifest, P1, 'create_arena_table', {
      metaGame: META,
      arenaTcId: TC,
      open: true,
    });
    assert(r.ok, !r.ok ? r.message : '');
    tableId = (r.data as { tableId: string }).tableId;
    const g = await authQueryAsPlayer(manifest, P1, 'get_arena_table', { tableId });
    assert(g.ok, !g.ok ? g.message : '');
    assertTableUiShape(g.data as Record<string, unknown>, manifest.players[P1]!.userId!);
    assert((g.data as { state: string }).state === 'open', 'expected open');
  }));

  assert(tableId, 'no tableId');
  const tid = tableId!;

  results.push(await step('guest join + lobby kibitz auth (t3 canComment)', async () => {
    const j = await authQueryAsPlayer(manifest, P2, 'join_arena_table', { tableId: tid });
    assert(j.ok, !j.ok ? j.message : '');
    const t = await authQueryAsPlayer(manifest, P1, 'get_arena_table', { tableId: tid });
    assert(t.ok, '');
    const table = t.data as Record<string, unknown>;
    assert(table.state === 'seated', `state=${table.state}`);
    const t3Id = manifest.players[P3]?.userId;
    assert(t3Id, 't3 userId');
    assert(
      lobbyCanComment({ id: t3Id! }, table),
      'spectator should comment in lobby (UI canComment)',
    );
    const c = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
      id: tid,
      metaGame: META,
      comment: 'S4 contract kibitz',
      moveNumber: 0,
    });
    assert(c.ok, !c.ok ? c.message : '');
  }));

  results.push(await step('ready launch → get_game play shell shape', async () => {
    await authQueryAsPlayer(manifest, P1, 'set_arena_ready', { tableId: tid, ready: true });
    const r2 = await authQueryAsPlayer(manifest, P2, 'set_arena_ready', { tableId: tid, ready: true });
    assert(r2.ok, !r2.ok ? r2.message : '');
    assert((r2.data as { launched?: boolean }).launched === true, 'not launched');
    const game = await authQueryAsPlayer(manifest, P1, 'get_game', {
      id: tid,
      metaGame: META,
      cbit: 0,
    });
    assert(game.ok, !game.ok ? game.message : '');
    const g = (game.data as { game?: Record<string, unknown> }).game;
    assert(g?.playMode === 'arena', 'playMode');
    assert(g?.id === tid, 'game.id === tableId');
    assert(g?.arenaClock, 'arenaClock for GameMove clock');
  }));

  results.push(await step('in-game spectator comment blocked (watch shell chat rule)', async () => {
    const c = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
      id: tid,
      metaGame: META,
      comment: 'blocked',
      moveNumber: 0,
    });
    assert(!c.ok, 'kibitz should fail in live play');
  }));

  results.push(await step('submit_arena_move ends game (play shell)', async () => {
    const m = await authQueryAsPlayer(manifest, P1, 'submit_arena_move', {
      id: tid,
      metaGame: META,
      cbit: 0,
      move: 'resign',
    });
    assert(m.ok, !m.ok ? m.message : '');
  }));

  results.push(await step('me_dashboard excludes arena (S4 nav contract)', async () => {
    const d = await authQueryAsPlayer(manifest, P1, 'me_dashboard', {
      vars: ['myMove', 'waiting', 'currentGames'],
    });
    assert(d.ok, !d.ok ? d.message : '');
    const data = d.data as Record<string, { id?: string }[] | undefined>;
    for (const key of ['myMove', 'waiting', 'currentGames'] as const) {
      const hit = (data[key] ?? []).some((row) => row.id === tid);
      assert(!hit, `arena game on ${key}`);
    }
  }));

  const failed = results.filter((s) => !s.ok);
  for (const s of results) {
    console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
