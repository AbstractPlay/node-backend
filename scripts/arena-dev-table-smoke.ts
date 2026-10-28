#!/usr/bin/env npx tsx
/**
 * S3 live dev smoke — arena table lobby → ready → launch → move → end.
 *
 *   npm run arena-dev-table-smoke
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
const GUEST = (process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2') as string;
const KIBITZ = (process.env.AP_ARENA_SMOKE_KIBITZ ?? 't3') as string;

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
  for (const key of [HOST, GUEST, KIBITZ]) {
    const p = manifest.players[key];
    assert(p?.refreshToken || p?.idToken, `${key} needs refreshToken in manifest`);
  }

  const results: StepResult[] = [];
  let tableId: string | undefined;

  results.push(await step(`${HOST} create_arena_table`, async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'create_arena_table', {
      metaGame: META_GAME,
      arenaTcId: TC_ID,
      open: true,
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
    const data = r.data as { tableId?: string };
    assert(data.tableId, 'missing tableId');
    tableId = data.tableId;
  }));

  if (!tableId) {
    for (const r of results) {
      const mark = r.ok ? 'PASS' : 'FAIL';
      console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    throw new Error('create_arena_table did not return tableId (is S3 deployed on dev?)');
  }

  results.push(await step(`${GUEST} join_arena_table`, async () => {
    const r = await authQueryAsPlayer(manifest, GUEST, 'join_arena_table', { tableId });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
  }));

  results.push(await step(`${HOST} get_arena_table — seated`, async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'get_arena_table', { tableId });
    assert(r.ok, !r.ok ? r.message : 'get_arena_table failed');
    const data = r.data as { table?: { state?: string; seats?: { userId?: string }[] } };
    assert(data.table?.state === 'seated', `state=${data.table?.state}`);
    const ids = (data.table?.seats ?? []).map((s) => s.userId).filter(Boolean);
    assert(ids.length === 2, `expected 2 seats, got ${ids.length}`);
  }));

  results.push(await step(`${KIBITZ} lobby submit_comment (kibitz)`, async () => {
    const r = await authQueryAsPlayer(manifest, KIBITZ, 'submit_comment', {
      id: tableId,
      metaGame: META_GAME,
      comment: 'arena table smoke — pre-launch',
      moveNumber: 0,
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
  }));

  results.push(await step('public list_arena_tables', async () => {
    const res = await fetch(publicQueryUrl(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'list_arena_tables',
        pars: { metaGame: META_GAME, limit: 20 },
      }),
    });
    const text = await res.text();
    assert(res.ok, text || res.statusText);
    const envelope = JSON.parse(text) as { statusCode?: number; body?: string };
    const body = typeof envelope.body === 'string'
      ? JSON.parse(envelope.body) as { tables?: { tableId: string }[] }
      : envelope as { tables?: { tableId: string }[] };
    assert(
      (body.tables ?? []).some((t) => t.tableId === tableId),
      `table ${tableId} not in list`,
    );
  }));

  results.push(await step(`${HOST} + ${GUEST} set_arena_ready → launch`, async () => {
    const r1 = await authQueryAsPlayer(manifest, HOST, 'set_arena_ready', {
      tableId,
      ready: true,
    });
    assert(r1.ok, !r1.ok ? r1.message : JSON.stringify(r1));
    const r2 = await authQueryAsPlayer(manifest, GUEST, 'set_arena_ready', {
      tableId,
      ready: true,
    });
    assert(r2.ok, !r2.ok ? r2.message : JSON.stringify(r2));
    const data = r2.data as { launched?: boolean };
    assert(data.launched === true, `launched=${data.launched}`);
  }));

  results.push(await step('get_game — playMode arena, id = tableId', async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'get_game', {
      id: tableId,
      metaGame: META_GAME,
      cbit: 0,
    });
    assert(r.ok, !r.ok ? r.message : 'get_game failed');
    const data = r.data as { game?: { playMode?: string; id?: string } };
    assert(data.game?.playMode === 'arena', `playMode=${data.game?.playMode}`);
    assert(data.game?.id === tableId, `game id=${data.game?.id}`);
  }));

  results.push(await step(`${GUEST} in-game submit_comment`, async () => {
    const r = await authQueryAsPlayer(manifest, GUEST, 'submit_comment', {
      id: tableId,
      metaGame: META_GAME,
      comment: 'live arena',
      moveNumber: 0,
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
  }));

  results.push(await step(`${KIBITZ} in-game comment rejected`, async () => {
    const r = await authQueryAsPlayer(manifest, KIBITZ, 'submit_comment', {
      id: tableId,
      metaGame: META_GAME,
      comment: 'should fail',
      moveNumber: 0,
    });
    assert(!r.ok, 'kibitz should fail during live play');
  }));

  results.push(await step(`${HOST} submit_arena_move resign`, async () => {
    const r = await authQueryAsPlayer(manifest, HOST, 'submit_arena_move', {
      id: tableId,
      metaGame: META_GAME,
      cbit: 0,
      move: 'resign',
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
  }));

  results.push(await step(`${KIBITZ} post-game submit_comment`, async () => {
    const r = await authQueryAsPlayer(manifest, KIBITZ, 'submit_comment', {
      id: tableId,
      metaGame: META_GAME,
      comment: 'gg',
      moveNumber: 1,
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
  }));

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed (tableId=${tableId})`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
