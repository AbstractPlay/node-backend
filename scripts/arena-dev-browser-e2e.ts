#!/usr/bin/env npx tsx
/**
 * Authenticated arena UI E2E on play.dev (Cognito cookies from refresh tokens).
 *
 * End-of-game coverage: table flow still ends via API resign for stability; a dedicated
 * step patches a short arena bank (AWS) and asserts the **play shell** shows game over
 * from client timeloss polling — the path that was missing when only spectator refresh
 * and scheduler E2E ran.
 *
 *   npx playwright install chromium
 *   AWS_PROFILE=AbstractPlayDev npm run arena-dev-browser-e2e
 */
import { chromium, type Page } from 'playwright';
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';
import {
  buildAmplifyCookieInjectionScript,
  cognitoSessionForPlayer,
} from '../lib/test/cognitoBrowserSession.js';
import { patchArenaDevGameForTimeloss } from '../lib/test/arenaFlagTimelossE2e.js';

const ORIGIN = process.env.AP_DEV_FRONT_ORIGIN ?? 'https://play.dev.abstractplay.com';
const META = process.env.AP_ARENA_SMOKE_META ?? 'hex';
const TC = process.env.AP_ARENA_SMOKE_TC ?? 'blitz_5_3';
const P1 = process.env.AP_ARENA_SMOKE_HOST ?? 't1';
const P2 = process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2';
const P3 = process.env.AP_ARENA_SMOKE_KIBITZ ?? 't3';

function assert(c: unknown, msg: string): asserts c {
  if (!c) throw new Error(msg);
}

async function injectSession(page: Page, playerKey: string) {
  const session = await cognitoSessionForPlayer(playerKey);
  await page.goto(`${ORIGIN}/arena`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(buildAmplifyCookieInjectionScript(session));
  await page.reload({ waitUntil: 'networkidle' });
}

async function assertLoggedIn(page: Page) {
  await page.getByRole('button', { name: 'Log In' }).waitFor({ state: 'hidden', timeout: 20_000 });
}

const OPEN_URL =
  process.env.AP_PUBLIC_QUERY_URL
  ?? 'https://alyhqu85me.execute-api.us-east-1.amazonaws.com/dev/query';

type ListedTable = {
  tableId: string;
  hostId?: string;
  seatUserIds?: string[];
  state?: string;
  metaGame?: string;
};

async function fetchListedArenaTables(pars: { metaGame?: string; limit?: number } = {}) {
  const res = await fetch(OPEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'list_arena_tables', pars }),
  });
  if (!res.ok) {
    return [] as ListedTable[];
  }
  const envelope = await res.json() as { body?: string };
  const body = typeof envelope.body === 'string'
    ? JSON.parse(envelope.body) as { tables?: ListedTable[] }
    : envelope as { tables?: ListedTable[] };
  return body.tables ?? [];
}

async function leaveQueueBoth(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
) {
  for (const key of [P1, P2]) {
    await authQueryAsPlayer(manifest, key, 'leave_arena_queue', {
      metaGame: META,
      arenaTcId: TC,
    });
  }
}

async function cancelTableAsHost(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  tableId: string,
) {
  for (const viewer of [P1, P2]) {
    const g = await authQueryAsPlayer(manifest, viewer, 'get_arena_table', { tableId });
    if (!g.ok) {
      continue;
    }
    const hostId = (g.data as { hostId?: string }).hostId;
    const hostKey = manifest.players[P1]?.userId === hostId ? P1 : P2;
    await authQueryAsPlayer(manifest, hostKey, 'cancel_arena_table', { tableId });
    return;
  }
}

async function releaseTableForPlayers(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  tableId: string,
) {
  const g = await authQueryAsPlayer(manifest, P1, 'get_arena_table', { tableId });
  if (!g.ok) {
    await cancelTableAsHost(manifest, tableId);
    return;
  }
  const row = g.data as { state?: string; metaGame?: string; hostId?: string; seatUserIds?: string[] };
  const metaGame = row.metaGame ?? META;
  if (row.state === 'playing') {
    const p1Id = manifest.players[P1]?.userId;
    const ids = row.seatUserIds ?? [];
    const mover = p1Id && ids.includes(p1Id) ? P1 : P2;
    await authQueryAsPlayer(manifest, mover, 'submit_arena_move', {
      id: tableId,
      metaGame,
      cbit: 0,
      move: 'resign',
    });
    return;
  }
  await cancelTableAsHost(manifest, tableId);
}

async function ensurePlayersFreeForArena(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
) {
  const p1Id = manifest.players[P1]?.userId;
  const p2Id = manifest.players[P2]?.userId;
  for (let pass = 0; pass < 3; pass++) {
    await leaveQueueBoth(manifest);
    const tables = await fetchListedArenaTables({ limit: 100 });
    let acted = false;
    for (const row of tables) {
      const ids = row.seatUserIds ?? [];
      const involved = (p1Id && ids.includes(p1Id)) || (p2Id && ids.includes(p2Id));
      if (!involved) {
        continue;
      }
      acted = true;
      await releaseTableForPlayers(manifest, row.tableId);
    }
    if (!acted) {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

function tableIdFromUrl(url: string): string | undefined {
  return url.match(/\/arena\/table\/[^/]+\/([^/?#]+)/)?.[1];
}

async function waitForQuickMatchTableId(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  page2: Page,
  timeoutMs = 35_000,
): Promise<string> {
  const p1Id = manifest.players[P1]?.userId;
  const p2Id = manifest.players[P2]?.userId;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fromUrl = tableIdFromUrl(page2.url());
    if (fromUrl) {
      return fromUrl;
    }
    const tables = await fetchListedArenaTables({ metaGame: META, limit: 50 });
    for (const row of tables) {
      const ids = row.seatUserIds ?? [];
      if (p1Id && p2Id && ids.includes(p1Id) && ids.includes(p2Id)) {
        return row.tableId;
      }
    }
    await page2.waitForTimeout(500);
  }
  throw new Error('quick match tableId');
}

async function postLobbyComment(page: Page, text: string) {
  const area = page.locator('#enterAComment');
  await area.waitFor({ state: 'visible', timeout: 15_000 });
  await area.fill(text);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
}

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  await ensurePlayersFreeForArena(manifest);

  const browser = await chromium.launch({ headless: true });
  const steps: { name: string; ok: boolean; detail?: string }[] = [];

  async function runStep(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      steps.push({ name, ok: true });
    } catch (e) {
      steps.push({
        name,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let tableId: string | undefined;
  const ctx1 = await browser.newContext();
  const page = await ctx1.newPage();

  await runStep('inject t1 session + landing', async () => {
    await injectSession(page, P1);
    await assertLoggedIn(page);
    await page.getByRole('heading', { name: 'Arena' }).waitFor();
    await page.getByRole('button', { name: 'Create open table' }).waitFor({ state: 'visible' });
  });

  await runStep('UI quick match (t1 queue + t2 queue → table)', async () => {
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    let qTable: string | undefined;
    try {
      await leaveQueueBoth(manifest);
      await page.goto(`${ORIGIN}/arena`, { waitUntil: 'networkidle' });
      await injectSession(page2, P2);
      await assertLoggedIn(page2);
      await page2.goto(`${ORIGIN}/arena`, { waitUntil: 'networkidle' });
      const qm = page.getByRole('button', { name: 'Quick match' });
      const qm2 = page2.getByRole('button', { name: 'Quick match' });
      await qm.click();
      await page.waitForTimeout(800);
      await qm2.click();
      qTable = await waitForQuickMatchTableId(manifest, page2);
      await page.goto(`${ORIGIN}/arena/table/${META}/${qTable}`, { waitUntil: 'networkidle' });
      await page.getByText(/Seat/i).first().waitFor({ timeout: 15_000 });
      await page2.goto(`${ORIGIN}/arena/table/${META}/${qTable}`, { waitUntil: 'networkidle' });
      await page2.getByText(/Seat/i).first().waitFor({ timeout: 15_000 });
    } finally {
      if (qTable) {
        await releaseTableForPlayers(manifest, qTable);
      }
      await ensurePlayersFreeForArena(manifest);
      await ctx2.close();
    }
  });

  await runStep('UI create open table → lobby', async () => {
    await ensurePlayersFreeForArena(manifest);
    await page.goto(`${ORIGIN}/arena`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Create open table' }).click();
    try {
      await page.waitForURL(/\/arena\/table\//, { timeout: 45_000 });
    } catch {
      const alert = await page.locator('[role="alert"]').innerText().catch(() => '');
      throw new Error(alert || 'create table navigation failed');
    }
    const m = page.url().match(/\/arena\/table\/[^/]+\/([^/?#]+)/);
    assert(m?.[1], 'tableId from URL');
    tableId = m![1];
    await page.getByText(/Seat/i).first().waitFor({ timeout: 15_000 });
  });

  await runStep('UI lobby table chat submit', async () => {
    assert(tableId, 'tableId');
    await postLobbyComment(page, 'playwright lobby chat');
    await page.waitForTimeout(1500);
  });

  await runStep('API t2 join + both ready → play route', async () => {
    assert(tableId, 'tableId');
    const j = await authQueryAsPlayer(manifest, P2, 'join_arena_table', { tableId });
    if (!j.ok) throw new Error(j.message);
    await authQueryAsPlayer(manifest, P1, 'set_arena_ready', { tableId, ready: true });
    const r2 = await authQueryAsPlayer(manifest, P2, 'set_arena_ready', { tableId, ready: true });
    if (!r2.ok) throw new Error(r2.message);
    await page.waitForURL(/\/arena\/play\//, { timeout: 45_000 });
  });

  await runStep('landing Watch link → watch shell', async () => {
    assert(tableId, 'tableId');
    await page.goto(`${ORIGIN}/arena`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.getByRole('link', { name: 'Watch' }).first().waitFor({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Watch' }).first().click();
    await page.waitForURL(/\/arena\/watch\//, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    if (!/Hex|hex|Resign|resign/i.test(text)) {
      throw new Error('watch shell missing game UI');
    }
  });

  await runStep('t3 watch: live chat composer hidden/blocked', async () => {
    assert(tableId, 'tableId');
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    try {
      await injectSession(page3, P3);
      await page3.goto(`${ORIGIN}/arena/watch/${META}/${tableId}`, { waitUntil: 'networkidle' });
      const composer = page3.locator('#enterAComment');
      const visible = await composer.isVisible().catch(() => false);
      if (visible) {
        await postLobbyComment(page3, 'spectator blocked');
        const blocked = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
          id: tableId,
          metaGame: META,
          comment: 'spectator blocked verify',
          moveNumber: 0,
        });
        assert(!blocked.ok, 't3 should not comment in live play');
      }
    } finally {
      await ctx3.close();
    }
  });

  await runStep('play shell (t1) still active', async () => {
    assert(tableId, 'tableId');
    await page.goto(`${ORIGIN}/arena/play/${META}/${tableId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    if (!/resign|Resign/i.test(text)) {
      throw new Error('play shell missing resign');
    }
  });

  await runStep('UI participant clock expiry → game over (timeloss poll)', async () => {
    const patched = await patchArenaDevGameForTimeloss({
      manifest,
      metaGame: META,
      tcId: TC,
      hostKey: P1,
      opponentKey: P2,
    });
    await injectSession(page, patched.onClockPlayerKey);
    await page.goto(
      `${ORIGIN}/arena/play/${patched.metaGame}/${patched.gameId}`,
      { waitUntil: 'networkidle' },
    );
    const waitMs = Math.max(0, patched.fireAtMs + 3000 - Date.now());
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
    await page.getByText(/The game has ended/i).waitFor({ timeout: 30_000 });
  });

  await runStep('API t1 resign ends game', async () => {
    assert(tableId, 'tableId');
    const m = await authQueryAsPlayer(manifest, P1, 'submit_arena_move', {
      id: tableId,
      metaGame: META,
      cbit: 0,
      move: 'resign',
    });
    if (!m.ok) throw new Error(m.message);
  });

  await runStep('t3 post-game kibitz on watch page', async () => {
    assert(tableId, 'tableId');
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    try {
      await injectSession(page3, P3);
      await page3.goto(`${ORIGIN}/arena/watch/${META}/${tableId}`, { waitUntil: 'networkidle' });
      await page3.waitForTimeout(3000);
      const composer = page3.locator('#enterAComment');
      if (await composer.isVisible().catch(() => false)) {
        await postLobbyComment(page3, 'gg from watch');
      }
      const ok = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
        id: tableId,
        metaGame: META,
        comment: 'gg api verify',
        moveNumber: 1,
      });
      assert(ok.ok, !ok.ok ? ok.message : 'post-game comment failed');
    } finally {
      await ctx3.close();
    }
  });

  await ctx1.close();
  await browser.close();
  await leaveQueueBoth(manifest);

  for (const s of steps) {
    console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} browser steps (tableId=${tableId ?? 'n/a'})`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
