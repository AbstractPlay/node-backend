#!/usr/bin/env npx tsx
/**
 * Full authenticated arena E2E (dev API + dev front contract).
 * Uses manifest refresh tokens. Timeloss step needs AWS (DDB + Scheduler).
 *
 *   npm run arena-dev-authenticated-e2e
 */
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';
import { DEV_AUTH_QUERY_URL } from '../lib/test/devStageConfig.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/ddb.js';
import { runArenaFlagTimelossE2e } from '../lib/test/arenaFlagTimelossE2e.js';

const OPEN_URL =
  process.env.AP_PUBLIC_QUERY_URL
  ?? DEV_AUTH_QUERY_URL.replace(/\/authQuery\/?$/, '/query');
const TABLE = process.env.ABSTRACT_PLAY_TABLE ?? 'abstract-play-dev';
process.env.ABSTRACT_PLAY_TABLE = TABLE;

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

async function gameCommentsExists(tableId: string): Promise<boolean> {
  const data = await ddbDocClient.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: 'GAMECOMMENTS', sk: tableId },
  }));
  return data.Item !== undefined;
}

async function cancelAsHost(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  tableId: string,
  viewer: string,
) {
  const g = await authQueryAsPlayer(manifest, viewer, 'get_arena_table', { tableId });
  assert(g.ok, !g.ok ? g.message : '');
  const hostId = (g.data as { hostId?: string }).hostId;
  const hostKey = manifest.players[P1]?.userId === hostId ? P1 : P2;
  await authQueryAsPlayer(manifest, hostKey, 'cancel_arena_table', { tableId });
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  const results: Step[] = [];

  for (const key of [P1, P2, P3]) {
    results.push(await step(`${key} me_profile`, async () => {
      const r = await authQueryAsPlayer(manifest, key, 'me_profile', {});
      assert(r.ok, !r.ok ? r.message : '');
    }));
  }

  results.push(await step('kernel: create_arena_dev_game + submit_arena_move', async () => {
    const oppId = manifest.players[P2]?.userId;
    assert(oppId, 't2 userId');
    const cr = await authQueryAsPlayer(manifest, P1, 'create_arena_dev_game', {
      metaGame: META,
      tcId: TC,
      opponentId: oppId,
    });
    assert(cr.ok, !cr.ok ? cr.message : '');
    const gameId = (cr.data as { gameId: string }).gameId;
    const mv = await authQueryAsPlayer(manifest, P1, 'submit_arena_move', {
      id: gameId,
      metaGame: META,
      cbit: 0,
      move: 'resign',
    });
    assert(mv.ok, !mv.ok ? mv.message : '');
  }));

  let abandonId: string | undefined;
  results.push(await step('S3: abandon deletes GAMECOMMENTS', async () => {
    const cr = await authQueryAsPlayer(manifest, P1, 'create_arena_table', {
      metaGame: META,
      arenaTcId: TC,
      open: true,
    });
    assert(cr.ok, !cr.ok ? cr.message : '');
    abandonId = (cr.data as { tableId: string }).tableId;
    await authQueryAsPlayer(manifest, P1, 'submit_comment', {
      id: abandonId,
      metaGame: META,
      comment: 'abandon test',
      moveNumber: 0,
    });
    assert(await gameCommentsExists(abandonId), 'comments missing');
    await authQueryAsPlayer(manifest, P1, 'cancel_arena_table', { tableId: abandonId });
    assert(!(await gameCommentsExists(abandonId)), 'comments remain');
  }));

  let swapId: string | undefined;
  results.push(await step('S3: seat swap clears ready', async () => {
    const cr = await authQueryAsPlayer(manifest, P1, 'create_arena_table', {
      metaGame: META,
      arenaTcId: TC,
      open: true,
    });
    assert(cr.ok, !cr.ok ? cr.message : '');
    swapId = (cr.data as { tableId: string }).tableId;
    await authQueryAsPlayer(manifest, P2, 'join_arena_table', { tableId: swapId });
    await authQueryAsPlayer(manifest, P1, 'set_arena_ready', { tableId: swapId, ready: true });
    await authQueryAsPlayer(manifest, P1, 'propose_arena_seat_swap', { tableId: swapId });
    const t = await authQueryAsPlayer(manifest, P2, 'get_arena_table', { tableId: swapId });
    assert(t.ok, '');
    const seats = (t.data as { seats?: { ready?: boolean }[] }).seats ?? [];
    assert(seats.every((s) => s.ready === false), 'ready not cleared');
    await cancelAsHost(manifest, swapId!, P1);
  }));

  results.push(await step('S3: join_arena_queue pairs', async () => {
    for (const p of [P1, P2]) {
      await authQueryAsPlayer(manifest, p, 'leave_arena_queue', { metaGame: META, arenaTcId: TC });
    }
    const q1 = await authQueryAsPlayer(manifest, P1, 'join_arena_queue', { metaGame: META, arenaTcId: TC });
    assert(q1.ok && (q1.data as { matched?: boolean }).matched === false, '');
    const q2 = await authQueryAsPlayer(manifest, P2, 'join_arena_queue', { metaGame: META, arenaTcId: TC });
    assert(q2.ok && (q2.data as { matched?: boolean }).matched === true, '');
    const qTable = (q2.data as { tableId?: string }).tableId!;
    await cancelAsHost(manifest, qTable, P1);
  }));

  let tableId: string | undefined;
  results.push(await step('S4: table lobby → launch → play → end', async () => {
    await postPublic('list_arena_time_controls');
    await postPublic('list_arena_tables', { limit: 5 });
    const cr = await authQueryAsPlayer(manifest, P1, 'create_arena_table', {
      metaGame: META,
      arenaTcId: TC,
      open: true,
    });
    assert(cr.ok, !cr.ok ? cr.message : '');
    tableId = (cr.data as { tableId: string }).tableId;
    await authQueryAsPlayer(manifest, P3, 'submit_comment', {
      id: tableId,
      metaGame: META,
      comment: 'lobby kibitz',
      moveNumber: 0,
    });
    await authQueryAsPlayer(manifest, P2, 'join_arena_table', { tableId });
    await authQueryAsPlayer(manifest, P1, 'set_arena_ready', { tableId, ready: true });
    const r2 = await authQueryAsPlayer(manifest, P2, 'set_arena_ready', { tableId, ready: true });
    assert(r2.ok && (r2.data as { launched?: boolean }).launched, '');
    const block = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
      id: tableId,
      metaGame: META,
      comment: 'nope',
      moveNumber: 0,
    });
    assert(!block.ok, '');
    await authQueryAsPlayer(manifest, P2, 'submit_comment', {
      id: tableId,
      metaGame: META,
      comment: 'in game',
      moveNumber: 0,
    });
    await authQueryAsPlayer(manifest, P1, 'submit_arena_move', {
      id: tableId,
      metaGame: META,
      cbit: 0,
      move: 'resign',
    });
    const after = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
      id: tableId,
      metaGame: META,
      comment: 'gg',
      moveNumber: 1,
    });
    assert(after.ok, !after.ok ? after.message : '');
  }));

  results.push(await step('S4: dashboard excludes arena', async () => {
    assert(tableId, 'no table');
    const d = await authQueryAsPlayer(manifest, P1, 'me_dashboard', {
      vars: ['myMove', 'waiting', 'currentGames'],
    });
    assert(d.ok, '');
    const data = d.data as Record<string, { id?: string }[] | undefined>;
    for (const k of ['myMove', 'waiting', 'currentGames'] as const) {
      assert(!(data[k] ?? []).some((g) => g.id === tableId), k);
    }
  }));

  results.push(await step('S1: scheduler flag → timeloss (AWS DDB)', async () => {
    const { gameId, winnerSeats } = await runArenaFlagTimelossE2e({ manifest });
    assert(gameId, 'gameId');
    assert(winnerSeats.length > 0, 'no winner');
  }));

  const failed = results.filter((s) => !s.ok);
  for (const s of results) {
    console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (tableId) {
    console.log(`Last table/play URLs: /arena/table/${META}/${tableId}  /arena/play/${META}/${tableId}`);
  }
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
