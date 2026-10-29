#!/usr/bin/env npx tsx
/**
 * Authenticated arena UI E2E on play.dev (Cognito cookies from refresh tokens).
 *
 * Table flow captures `tableId` + meta from the create-table URL, polls `get_game` after
 * launch into `liveGame`, then ends that game via API resign before the timeloss patch game.
 * Play shell waits for GameMove chrome (not whole-page `innerText` / Resign-only — Resign is
 * mover-turn-only in the strip dock).
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

function tableRouteFromUrl(url: string): { metaGame?: string; tableId?: string } {
  const m = url.match(/\/arena\/table\/([^/]+)\/([^/?#]+)/);
  if (!m) {
    return {};
  }
  return { metaGame: m[1], tableId: m[2] };
}

function tableIdFromUrl(url: string): string | undefined {
  return tableRouteFromUrl(url).tableId;
}

type LiveArenaGame = {
  gameId: string;
  metaGame: string;
};

/** After launch, arena game id equals tableId; metaGame comes from the table row / URL. */
async function pollLiveArenaGame(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  playerKey: string,
  tableId: string,
  metaGameHint: string,
  timeoutMs = 60_000,
): Promise<LiveArenaGame> {
  const deadline = Date.now() + timeoutMs;
  let metaGame = metaGameHint;
  while (Date.now() < deadline) {
    const tbl = await authQueryAsPlayer(manifest, playerKey, 'get_arena_table', { tableId });
    if (tbl.ok) {
      const row = tbl.data as { metaGame?: string; state?: string };
      if (row.metaGame) {
        metaGame = row.metaGame;
      }
    }
    const g = await authQueryAsPlayer(manifest, playerKey, 'get_game', {
      id: tableId,
      metaGame,
      cbit: 0,
    });
    if (g.ok) {
      const game = (g.data as {
        game?: {
          id?: string;
          metaGame?: string;
          playMode?: string;
          gameEnded?: number;
          toMove?: string | boolean[];
        };
      }).game;
      if (
        game?.playMode === 'arena'
        && game.id
        && !game.gameEnded
        && game.toMove !== ''
        && game.toMove !== undefined
      ) {
        return { gameId: game.id, metaGame: game.metaGame ?? metaGame };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`live arena game not ready (table ${tableId}, meta ${metaGame})`);
}

async function waitForPlayShellReady(page: Page, live: LiveArenaGame) {
  const playPath = `/arena/play/${live.metaGame}/${live.gameId}`;
  if (!page.url().includes(playPath)) {
    await page.goto(`${ORIGIN}${playPath}`, { waitUntil: 'domcontentloaded' });
  }
  await page.locator('.game-move-shell').waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator('.page-loading').waitFor({ state: 'detached', timeout: 45_000 });
  // Resign is only rendered on the mover's turn; any live shell chrome is enough here.
  await page.waitForFunction(
    () => {
      const shell = document.querySelector('.game-move-shell');
      if (!shell || document.querySelector('.page-loading')) {
        return false;
      }
      const text = shell.textContent ?? '';
      if (/resign/i.test(text)) {
        return true;
      }
      return Boolean(
        shell.querySelector('.game-move-dock-entry__turn, .playerName, .toMoveImage'),
      );
    },
    undefined,
    { timeout: 45_000 },
  );
}

async function assertArenaGameEnded(
  manifest: Awaited<ReturnType<typeof loadDevTestPlayersManifest>>,
  playerKey: string,
  live: LiveArenaGame,
) {
  const active = await authQueryAsPlayer(manifest, playerKey, 'get_game', {
    id: live.gameId,
    metaGame: live.metaGame,
    cbit: 0,
  });
  if (active.ok) {
    const game = (active.data as { game?: { gameEnded?: number; toMove?: string } }).game;
    if (game?.gameEnded !== undefined || game?.toMove === '') {
      return;
    }
  }
  const done = await authQueryAsPlayer(manifest, playerKey, 'get_game', {
    id: live.gameId,
    metaGame: live.metaGame,
    cbit: 1,
  });
  assert(done.ok, !done.ok ? done.message : 'no completed game after resign');
}

async function postLobbyComment(page: Page, text: string) {
  const area = page.locator('#enterAComment');
  await area.waitFor({ state: 'visible', timeout: 15_000 });
  await area.fill(text);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
}

/** Landing requires an explicit game pick before create table (front gameChosen gate). */
async function prepareArenaLandingActions(page: Page, metaGame: string) {
  const createOpen = page.getByRole('button', { name: 'Create open table' });
  await createOpen.waitFor({ state: 'visible', timeout: 20_000 });
  if (await createOpen.isEnabled()) {
    return;
  }
  await page.locator('#arena-meta-picker').click();
  await page.locator('#gamePickerSearch').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('#gamePickerSearch').fill(metaGame);
  await page.waitForTimeout(400);
  const browsePick = page.locator('.game-picker-browse-list button').first();
  await browsePick.waitFor({ state: 'visible', timeout: 15_000 });
  await browsePick.click();
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.includes('Create open table'));
      return btn instanceof HTMLButtonElement && !btn.disabled;
    },
    undefined,
    { timeout: 25_000 },
  );
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
  let tableMetaGame = META;
  let liveGame: LiveArenaGame | undefined;
  const ctx1 = await browser.newContext();
  const page = await ctx1.newPage();

  await runStep('inject t1 session + landing', async () => {
    await injectSession(page, P1);
    await assertLoggedIn(page);
    await page.getByRole('heading', { name: 'Arena' }).waitFor();
    await prepareArenaLandingActions(page, META);
  });

  await runStep('UI create open table → lobby', async () => {
    await ensurePlayersFreeForArena(manifest);
    await page.goto(`${ORIGIN}/arena`, { waitUntil: 'networkidle' });
    await prepareArenaLandingActions(page, META);
    await page.getByRole('button', { name: 'Create open table' }).click();
    try {
      await page.waitForURL(/\/arena\/table\//, { timeout: 45_000 });
    } catch {
      const alert = await page.locator('[role="alert"]').innerText().catch(() => '');
      throw new Error(alert || 'create table navigation failed');
    }
    const route = tableRouteFromUrl(page.url());
    assert(route.tableId, 'tableId from URL');
    tableId = route.tableId;
    if (route.metaGame) {
      tableMetaGame = route.metaGame;
    }
    await page.getByText(/Seats?/i).first().waitFor({ timeout: 15_000 });
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
    const launched = (r2.data as { launched?: boolean }).launched === true;
    assert(launched, `set_arena_ready did not launch (launched=${(r2.data as { launched?: boolean }).launched})`);
    liveGame = await pollLiveArenaGame(manifest, P1, tableId, tableMetaGame);
    await page.waitForURL(/\/arena\/play\//, { timeout: 45_000 });
  });

  await runStep('play shell (t1) still active', async () => {
    assert(liveGame, 'liveGame from launch');
    await waitForPlayShellReady(page, liveGame);
  });

  await runStep('landing Watch link → watch shell', async () => {
    assert(liveGame, 'liveGame from launch');
    await page.goto(`${ORIGIN}/arena`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.getByRole('link', { name: 'Watch' }).first().waitFor({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Watch' }).first().click();
    await page.waitForURL(/\/arena\/watch\//, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    if (!/Hex|hex|Resign|resign|ended/i.test(text)) {
      throw new Error('watch shell missing game UI');
    }
  });

  await runStep('t3 watch: live chat composer hidden/blocked', async () => {
    assert(liveGame, 'liveGame from launch');
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    try {
      await injectSession(page3, P3);
      await page3.goto(
        `${ORIGIN}/arena/watch/${liveGame.metaGame}/${liveGame.gameId}`,
        { waitUntil: 'networkidle' },
      );
      const composer = page3.locator('#enterAComment');
      const visible = await composer.isVisible().catch(() => false);
      if (visible) {
        await postLobbyComment(page3, 'spectator blocked');
        const blocked = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
          id: liveGame.gameId,
          metaGame: liveGame.metaGame,
          comment: 'spectator blocked verify',
          moveNumber: 0,
        });
        assert(!blocked.ok, 't3 should not comment in live play');
      }
    } finally {
      await ctx3.close();
    }
  });

  await runStep('API t1 resign ends game', async () => {
    assert(liveGame, 'liveGame from launch');
    const m = await authQueryAsPlayer(manifest, P1, 'submit_arena_move', {
      id: liveGame.gameId,
      metaGame: liveGame.metaGame,
      cbit: 0,
      move: 'resign',
    });
    if (!m.ok) throw new Error(m.message);
    await assertArenaGameEnded(manifest, P1, liveGame);
  });

  await runStep('t3 post-game kibitz on watch page', async () => {
    assert(liveGame, 'liveGame from launch');
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    try {
      await injectSession(page3, P3);
      await page3.goto(
        `${ORIGIN}/arena/watch/${liveGame.metaGame}/${liveGame.gameId}`,
        { waitUntil: 'networkidle' },
      );
      await page3.waitForTimeout(3000);
      const composer = page3.locator('#enterAComment');
      if (await composer.isVisible().catch(() => false)) {
        await postLobbyComment(page3, 'gg from watch');
      }
      const ok = await authQueryAsPlayer(manifest, P3, 'submit_comment', {
        id: liveGame.gameId,
        metaGame: liveGame.metaGame,
        comment: 'gg api verify',
        moveNumber: 1,
      });
      assert(ok.ok, !ok.ok ? ok.message : 'post-game comment failed');
    } finally {
      await ctx3.close();
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

  await ctx1.close();
  await browser.close();
  await leaveQueueBoth(manifest);

  for (const s of steps) {
    console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} browser steps (tableId=${tableId ?? 'n/a'}, game=${liveGame?.gameId ?? 'n/a'})`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
