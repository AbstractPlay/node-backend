#!/usr/bin/env npx tsx
/**
 * Run one dev authQuery as a named test player.
 *
 * Setup: test/fixtures/dev-test-players.json (see docs/testing/dev-auth-rpc.md)
 *
 * Examples:
 *   npx tsx scripts/dev-auth-query.ts --list-players
 *   npx tsx scripts/dev-auth-query.ts --player owner me_dashboard
 *   npx tsx scripts/dev-auth-query.ts --player p2 get_ladder --ladderId <uuid>
 */
import {
  authQueryAsPlayer,
  loadDevTestPlayersManifest,
  manifestDefaults,
  resolveDevTestPlayersPath,
} from '../lib/test/devTestPlayers.js';

function usage(): void {
  console.error(`Usage:
  npx tsx scripts/dev-auth-query.ts --list-players
  npx tsx scripts/dev-auth-query.ts --player <key> <queryName> [--pars '<json>'] [--no-defaults]

Env:
  AP_DEV_TEST_PLAYERS  path to manifest (default: test/fixtures/dev-test-players.json)
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const manifestPath = resolveDevTestPlayersPath();

  if (argv.includes('--list-players')) {
    const manifest = await loadDevTestPlayersManifest(manifestPath);
    for (const [key, p] of Object.entries(manifest.players)) {
      const hasAuth = Boolean(p.refreshToken || p.idToken);
      console.log(`${key}\t${p.label ?? ''}\t${p.userId ?? ''}\tauth=${hasAuth}`);
    }
    const defaults = manifestDefaults(manifest);
    if (Object.keys(defaults).length > 0) {
      console.log(`defaults=${JSON.stringify(defaults)}`);
    }
    return;
  }

  const playerIdx = argv.indexOf('--player');
  if (playerIdx < 0 || argv.length < playerIdx + 2) {
    usage();
    process.exit(1);
  }
  const playerKey = argv[playerIdx + 1]!;
  const query = argv[playerIdx + 2];
  if (!query) {
    usage();
    process.exit(1);
  }

  const manifest = await loadDevTestPlayersManifest(manifestPath);
  const pars: Record<string, unknown> = {};
  const parsIdx = argv.indexOf('--pars');
  if (parsIdx >= 0 && argv[parsIdx + 1]) {
    Object.assign(pars, JSON.parse(argv[parsIdx + 1]!));
  }
  if (!argv.includes('--no-defaults')) {
    for (const [k, v] of Object.entries(manifestDefaults(manifest))) {
      if (pars[k] === undefined) {
        pars[k] = v;
      }
    }
  }

  const result = await authQueryAsPlayer(manifest, playerKey, query, pars);
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
