#!/usr/bin/env npx tsx
/**
 * Live dev ladder smoke — uses test/fixtures/dev-test-players.json + authQuery.
 *
 *   npx tsx scripts/ladder-dev-smoke.ts
 *   npx tsx scripts/ladder-dev-smoke.ts --skip-matchmaking
 */
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  manifestDefaults,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';

type StepResult = { name: string; ok: boolean; detail?: string };

const skipMatchmaking = process.argv.includes('--skip-matchmaking');

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

async function step(
  name: string,
  fn: () => Promise<void>,
): Promise<StepResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, ok: false, detail };
  }
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  const defaults = manifestDefaults(manifest);
  const ladderId = defaults.ladderId;
  assert(ladderId, 'manifest defaults.ladderId is required');

  const ladderPlayers = ['me', 't1', 't2', 't3'] as const;
  for (const key of ladderPlayers) {
    assert(manifest.players[key]?.refreshToken || manifest.players[key]?.idToken, `player ${key} has no auth`);
  }

  const results: StepResult[] = [];
  let metaGame = 'amazons';
  let boardUserIds: string[] = [];

  results.push(await step('get_ladder (me) — active ladder + board', async () => {
    const r = await authQueryAsPlayer(manifest, 'me', 'get_ladder', { ladderId });
    assert(r.ok, !r.ok ? r.message : 'get_ladder failed');
    const data = r.data as {
      ladder?: { status?: string; metaGame?: string; ladderId?: string };
      board?: { userid: string }[];
      viewer?: { membershipStatus?: string };
    };
    assert(data.ladder?.status === 'active', `expected active, got ${data.ladder?.status}`);
    assert(data.ladder?.ladderId === ladderId, 'ladderId mismatch');
    assert(data.viewer?.membershipStatus === 'active', 'viewer not active member');
    assert((data.board?.length ?? 0) >= 4, 'board needs at least 4 members');
    metaGame = data.ladder?.metaGame ?? metaGame;
    boardUserIds = (data.board ?? []).map((row) => row.userid);
  }));

  for (const key of ladderPlayers) {
    results.push(await step(`get_ladder (${key}) — active membership`, async () => {
      const r = await authQueryAsPlayer(manifest, key, 'get_ladder', { ladderId });
      assert(r.ok, !r.ok ? r.message : 'get_ladder failed');
      const data = r.data as { viewer?: { membershipStatus?: string } };
      assert(data.viewer?.membershipStatus === 'active', `${key} not active on ladder`);
    }));
  }

  results.push(await step('me_dashboard (me) — ladderMemberships', async () => {
    const r = await authQueryAsPlayer(manifest, 'me', 'me_dashboard', { vars: ['ladderMemberships', 'currentLadderGames'] });
    assert(r.ok, !r.ok ? r.message : 'me_dashboard failed');
    const data = r.data as {
      ladderMemberships?: { ladderId?: string }[];
      currentLadderGames?: unknown[];
    };
    const member = (data.ladderMemberships ?? []).some((m) => m.ladderId === ladderId);
    assert(member, 'ladderId missing from ladderMemberships');
  }));

  results.push(await step('submit_ladder_comment (me)', async () => {
    const stamp = `smoke ${new Date().toISOString()}`;
    const r = await authQueryAsPlayer(manifest, 'me', 'submit_ladder_comment', {
      ladderId,
      comment: stamp,
    });
    assert(r.ok, !r.ok ? r.message : 'submit_ladder_comment failed');
  }));

  results.push(await step('leave_ladder_pool (me) — idempotent', async () => {
    const r = await authQueryAsPlayer(manifest, 'me', 'leave_ladder_pool', { ladderId });
    assert(r.ok, !r.ok ? r.message : 'leave_ladder_pool failed');
  }));

  if (!skipMatchmaking) {
    const meUserId = manifest.players.me?.userId ?? boardUserIds[0];
    const opponentKey = 't2' as const;
    const opponentId = manifest.players[opponentKey]?.userId
      ?? boardUserIds.find((id) => id !== meUserId);
    assert(opponentId, 'could not resolve opponent user id');

    let challengeId: string | undefined;

    results.push(await step('new_ladder_challenge (me → t2)', async () => {
      const r = await authQueryAsPlayer(manifest, 'me', 'new_ladder_challenge', {
        ladderId,
        opponentId,
        comment: 'ladder-dev-smoke',
      });
      assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
    }));

    results.push(await step('resolve challenge id (t2 dashboard)', async () => {
      const r = await authQueryAsPlayer(manifest, opponentKey, 'me_dashboard', {});
      assert(r.ok, !r.ok ? r.message : 'me_dashboard failed');
      const data = r.data as {
        challengesReceived?: { id?: string; metaGame?: string; ladderId?: string }[];
      };
      const pending = (data.challengesReceived ?? []).find(
        (c) => c.ladderId === ladderId && c.metaGame === metaGame,
      );
      assert(pending?.id, 'no pending ladder challenge on t2 dashboard');
      challengeId = pending.id;
    }));

    assert(challengeId, 'challenge id not resolved');

    results.push(await step('respond_ladder_challenge (t2 accept)', async () => {
      const r = await authQueryAsPlayer(manifest, opponentKey, 'respond_ladder_challenge', {
        id: challengeId,
        metaGame,
        response: true,
        comment: 'accepted smoke',
      });
      assert(r.ok, !r.ok ? r.message : JSON.stringify(r));
    }));

    results.push(await step('get_ladder — active game counts bumped', async () => {
      const r = await authQueryAsPlayer(manifest, 'me', 'get_ladder', { ladderId });
      assert(r.ok, !r.ok ? r.message : 'get_ladder failed');
      const data = r.data as { board?: { userid: string; activeLadderGameCount?: number }[] };
      const meRow = data.board?.find((row) => row.userid === meUserId);
      const oppRow = data.board?.find((row) => row.userid === opponentId);
      assert((meRow?.activeLadderGameCount ?? 0) >= 1, 'issuer activeLadderGameCount');
      assert((oppRow?.activeLadderGameCount ?? 0) >= 1, 'opponent activeLadderGameCount');
    }));
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed (ladderId=${ladderId})`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
