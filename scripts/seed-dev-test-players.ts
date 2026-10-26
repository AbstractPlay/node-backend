#!/usr/bin/env npx tsx
/**
 * Interactive dev login → refresh tokens → dev-test-players.json
 *
 * Cognito SRP (dev pool + app client) → refresh tokens for dev-auth-query → authQuery.
 *
 *   npx tsx scripts/seed-dev-test-players.ts
 */
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signInDevWithPassword } from '../lib/test/devAmplifyAuth.js';
import {
  DEV_AUTH_QUERY_URL,
  DEV_COGNITO_CLIENT_ID,
} from '../lib/test/devStageConfig.js';
import type { DevTestPlayersManifest } from '../lib/test/devTestPlayers.js';
import { resolveDevTestPlayersPath } from '../lib/test/devTestPlayers.js';

const repoRoot = path.join(fileURLToPath(new URL('../', import.meta.url)));
const examplePath = path.join(repoRoot, 'test/fixtures/dev-test-players.example.json');

async function loadOrCreateManifest(): Promise<DevTestPlayersManifest> {
  const outPath = resolveDevTestPlayersPath();
  try {
    const raw = await readFile(outPath, 'utf8');
    return JSON.parse(raw) as DevTestPlayersManifest;
  } catch {
    const raw = await readFile(examplePath, 'utf8');
    const base = JSON.parse(raw) as DevTestPlayersManifest;
    delete (base as { _comment?: string })._comment;
    return base;
  }
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const manifest = await loadOrCreateManifest();
  manifest.authQueryUrl = manifest.authQueryUrl ?? DEV_AUTH_QUERY_URL;
  manifest.cognitoClientId = manifest.cognitoClientId ?? DEV_COGNITO_CLIENT_ID;
  manifest.defaults = manifest.defaults ?? {};
  if (!manifest.players) {
    manifest.players = {};
  }

  console.log('Dev test players manifest seed');
  console.log(`Output: ${resolveDevTestPlayersPath()}`);
  console.log(`authQuery: ${manifest.authQueryUrl}`);
  console.log('Sign in with each dev account (email + password). Empty player key to finish.\n');

  for (;;) {
    const key = (await rl.question('Player key (empty = done): ')).trim();
    if (!key) {
      break;
    }

    const username = (await rl.question('Username (email): ')).trim();
    if (!username) {
      console.log('Skipped.\n');
      continue;
    }
    const password = await rl.question('Password: ');
    if (!password) {
      console.log('Skipped.\n');
      continue;
    }

    try {
      const tokens = await signInDevWithPassword(
        username,
        password,
        async (step) => (await rl.question(`${step} code: `)).trim(),
      );
      const existing = manifest.players[key] ?? {};
      manifest.players[key] = {
        ...existing,
        label: existing.label ?? username,
        userId: tokens.sub ?? existing.userId,
        refreshToken: tokens.refreshToken,
      };
      delete manifest.players[key]!.idToken;
      console.log(`OK ${key} → sub ${tokens.sub ?? '(unknown)'}\n`);
    } catch (err) {
      console.error(`Auth failed for ${key}:`, err instanceof Error ? err.message : err);
      console.log('');
    }
  }

  const defaultsHint = JSON.stringify(manifest.defaults);
  const defaultsRaw = (await rl.question(
    `defaults JSON (pars fallbacks) [${defaultsHint}]: `,
  )).trim();
  if (defaultsRaw) {
    manifest.defaults = JSON.parse(defaultsRaw) as Record<string, string>;
  }
  delete manifest.defaultLadderId;

  await rl.close();

  const outPath = resolveDevTestPlayersPath();
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
  console.log('Test: npx tsx scripts/dev-auth-query.ts --list-players');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
