#!/usr/bin/env npx tsx
/**
 * S1 dev E2E: EventBridge Scheduler flag → arenaFlagWorker → timeloss.
 *
 *   AWS_PROFILE=AbstractPlayDev npm run arena-dev-flag-timeloss
 */
import {
  loadDevTestPlayersManifest,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';
import { runArenaFlagTimelossE2e } from '../lib/test/arenaFlagTimelossE2e.js';

const HOST = process.env.AP_ARENA_SMOKE_HOST ?? 't1';
const OPPONENT = process.env.AP_ARENA_SMOKE_OPPONENT ?? 't2';
const META_GAME = process.env.AP_ARENA_SMOKE_META ?? 'hex';
const TC_ID = process.env.AP_ARENA_SMOKE_TC ?? 'blitz_5_3';

async function main() {
  const manifest = await loadDevTestPlayersManifest(resolveDevTestPlayersPath());
  console.log(`Creating arena game (${HOST} vs ${OPPONENT}, ${META_GAME}, ${TC_ID})…`);
  const { gameId, winnerSeats } = await runArenaFlagTimelossE2e({
    manifest,
    hostKey: HOST,
    opponentKey: OPPONENT,
    metaGame: META_GAME,
    tcId: TC_ID,
  });
  console.log(`gameId=${gameId}`);
  console.log(`PASS  flag → timeloss (winner seats: ${JSON.stringify(winnerSeats)})`);
  console.log('PASS  me_dashboard excludes ended arena game');
  console.log(`\nflag → timeloss OK (gameId=${gameId})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
