#!/usr/bin/env npx tsx
/**
 * Interactive dev login → refresh tokens → dev-test-players.json
 *
 * Default: Cognito hosted UI (same OAuth flow as play.dev).
 *   npx tsx scripts/seed-dev-test-players.ts
 *
 * Password + SRP (optional):
 *   npx tsx scripts/seed-dev-test-players.ts --password
 */
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  signInDevWithHostedUi,
  signInDevWithPassword,
} from '../lib/test/devAmplifyAuth.js';
import {
  DEV_AUTH_QUERY_URL,
  DEV_COGNITO_CLIENT_ID,
} from '../lib/test/devStageConfig.js';
import type { DevTestPlayersManifest } from '../lib/test/devTestPlayers.js';
import { resolveDevTestPlayersPath } from '../lib/test/devTestPlayers.js';

const repoRoot = path.join(fileURLToPath(new URL('../', import.meta.url)));
const examplePath = path.join(repoRoot, 'test/fixtures/dev-test-players.example.json');
const usePassword = process.argv.includes('--password');

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
  console.log(
    usePassword
      ? 'Mode: username/password (Amplify SRP)\n'
      : 'Mode: hosted UI OAuth (same as play.dev)\n',
  );
  console.log('Enter player keys (e.g. owner, p2). Empty key to finish.\n');

  for (;;) {
    const key = (await rl.question('Player key (empty = done): ')).trim();
    if (!key) {
      break;
    }

    try {
      let refreshToken: string;
      let sub: string | undefined;
      let label = manifest.players[key]?.label;

      if (usePassword) {
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
        const tokens = await signInDevWithPassword(
          username,
          password,
          async (step) => (await rl.question(`${step} code: `)).trim(),
        );
        refreshToken = tokens.refreshToken;
        sub = tokens.sub;
        label = label ?? username;
      } else {
        console.log(`Sign in as "${key}" in the browser when it opens…`);
        const tokens = await signInDevWithHostedUi();
        refreshToken = tokens.refreshToken;
        sub = tokens.sub;
      }

      const existing = manifest.players[key] ?? {};
      manifest.players[key] = {
        ...existing,
        label: label ?? existing.label ?? key,
        userId: sub ?? existing.userId,
        refreshToken,
      };
      delete manifest.players[key]!.idToken;
      console.log(`OK ${key} → sub ${sub ?? '(unknown)'}\n`);
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
