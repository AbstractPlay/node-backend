#!/usr/bin/env npx tsx
/**
 * S3 gate E2E — abandon/GAMECOMMENTS, seat swap clears ready, quick-match queue.
 *
 *   AWS_PROFILE=AbstractPlayDev npm run arena-dev-table-gates
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../lib/ddb.js';
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';

const STAGE = process.env.WEBSOCKET_STAGE ?? 'dev';
const TABLE = process.env.ABSTRACT_PLAY_TABLE ?? `abstract-play-${STAGE}`;
process.env.ABSTRACT_PLAY_TABLE = TABLE;

const META_GAME = process.env.AP_ARENA_SMOKE_META ?? 'hex';
const TC_ID = process.env.AP_ARENA_SMOKE_TC ?? 'blitz_5_3';
const P1 = (process.env.AP_ARENA_SMOKE_HOST ?? 't1') as string;
const P2 = (process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2') as string;

type StepResult = { name: string; ok: boolean; detail?: string };

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

async function gameCommentsExists(tableId: string): Promise<boolean> {
  const data = await ddbDocClient.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: 'GAMECOMMENTS', sk: tableId },
  }));
  return data.Item !== undefined;
}

type ArenaTableView = {
  state?: string;
  hostId?: string;
  seats?: { userId?: string; ready?: boolean }[];
};

async function getArenaTable(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  player: string,
  tableId: string,
): Promise<ArenaTableView> {
  const r = await authQueryAsPlayer(manifest, player, 'get_arena_table', { tableId });
  assert(r.ok, !r.ok ? r.message : 'get_arena_table failed');
  return r.data as ArenaTableView;
}

async function cancelAsHost(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  tableId: string,
): Promise<void> {
  const t = await getArenaTable(manifest, P1, tableId);
  const hostId = t.hostId;
  assert(hostId, 'missing hostId');
  const hostKey = manifest.players[P1]?.userId === hostId
    ? P1
    : manifest.players[P2]?.userId === hostId
      ? P2
      : undefined;
  assert(hostKey, `unknown host ${hostId}`);
  await authQueryAsPlayer(manifest, hostKey, 'cancel_arena_table', { tableId });
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  for (const key of [P1, P2]) {
    const p = manifest.players[key];
    assert(p?.refreshToken || p?.idToken, `${key} needs refreshToken in manifest`);
  }

  const results: StepResult[] = [];

  // --- Abandon deletes GAMECOMMENTS ---
  let abandonTableId: string | undefined;
  results.push(await step('abandon: create table + comment', async () => {
    const r = await authQueryAsPlayer(manifest, P1, 'create_arena_table', {
      metaGame: META_GAME,
      arenaTcId: TC_ID,
      open: true,
    });
    assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
    abandonTableId = (r.data as { tableId: string }).tableId;
    const c = await authQueryAsPlayer(manifest, P1, 'submit_comment', {
      id: abandonTableId,
      metaGame: META_GAME,
      comment: 'gate — abandon deletes comments',
      moveNumber: 0,
    });
    assert(c.ok, !c.ok ? c.message : 'submit_comment failed');
    assert(await gameCommentsExists(abandonTableId), 'GAMECOMMENTS row missing before cancel');
  }));

  if (abandonTableId) {
    results.push(await step('abandon: cancel_arena_table removes GAMECOMMENTS', async () => {
      const r = await authQueryAsPlayer(manifest, P1, 'cancel_arena_table', {
        tableId: abandonTableId,
      });
      assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
      assert(!(await gameCommentsExists(abandonTableId!)), 'GAMECOMMENTS still present after abandon');
      const g = await authQueryAsPlayer(manifest, P1, 'get_arena_table', { tableId: abandonTableId });
      assert(!g.ok, 'get_arena_table should fail after abandon');
    }));
  }

  // --- Seat swap clears ready ---
  let swapTableId: string | undefined;
  results.push(await step('seat swap: create + join + host ready', async () => {
    const created = await authQueryAsPlayer(manifest, P1, 'create_arena_table', {
      metaGame: META_GAME,
      arenaTcId: TC_ID,
      open: true,
    });
    assert(created.ok, !created.ok ? created.message : JSON.stringify(created));
    swapTableId = (created.data as { tableId: string }).tableId;
    const joined = await authQueryAsPlayer(manifest, P2, 'join_arena_table', { tableId: swapTableId });
    assert(joined.ok, !joined.ok ? joined.message : JSON.stringify(joined));
    const r1 = await authQueryAsPlayer(manifest, P1, 'set_arena_ready', { tableId: swapTableId, ready: true });
    assert(r1.ok, !r1.ok ? r1.message : 'set_arena_ready failed');
    const t = await getArenaTable(manifest, P1, swapTableId!);
    const p1Id = manifest.players[P1]?.userId;
    assert(p1Id, `${P1} userId in manifest`);
    const hostSeat = t.seats?.find((s) => s.userId === p1Id);
    assert(hostSeat?.ready === true, `host ready=${hostSeat?.ready}`);
  }));

  if (swapTableId) {
    results.push(await step('seat swap: propose clears ready on both seats', async () => {
      const prop = await authQueryAsPlayer(manifest, P1, 'propose_arena_seat_swap', { tableId: swapTableId });
      assert(prop.ok, !prop.ok ? prop.message : JSON.stringify(prop));
      const t = await getArenaTable(manifest, P2, swapTableId!);
      assert(t.seats?.every((s) => s.ready === false), 'expected ready=false after propose');
    }));
    results.push(await step('seat swap: cleanup cancel', async () => {
      await cancelAsHost(manifest, swapTableId!);
    }));
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
