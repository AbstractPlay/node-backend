# Dev auth RPC testing (multi-player)

Run **`authQuery`** on the dev API as named test accounts without clicking through the UI. Use this for ladders, tournaments, challenges, dashboard checks, or any authenticated query.

## One-time setup

1. Copy the example manifest:

   ```bash
   cp test/fixtures/dev-test-players.example.json test/fixtures/dev-test-players.json
   ```

   `dev-test-players.json` is **gitignored**.

2. Add **Cognito refresh tokens** for each account:

   **Interactive (local gitignored helper):**

   ```bash
   npx tsx scripts/seed-dev-test-players.ts
   ```

   Prompts for player keys; opens the **Cognito hosted UI** in your browser (same OAuth `code` flow as [play.dev](https://play.dev.abstractplay.com)). Writes `test/fixtures/dev-test-players.json`.

   Loopback redirect defaults to `http://127.0.0.1:9234/` (`AP_DEV_OAUTH_REDIRECT`). Add that callback URL to the dev Cognito app client if login fails with `redirect_mismatch`.

   Optional password sign-in (Amplify SRP, same app client): `npx tsx scripts/seed-dev-test-players.ts --password`

   Or paste `refreshToken` values manually under `players.<key>`.

3. Optional **`defaults`** object — merged into `pars` by `dev-auth-query` when a key is omitted (e.g. `"ladderId": "<uuid>"` for ladder RPCs).

## Run a query

```bash
npx tsx scripts/dev-auth-query.ts --list-players

npx tsx scripts/dev-auth-query.ts --player owner me_dashboard

npx tsx scripts/dev-auth-query.ts --player p2 get_ladder
# ladderId from defaults if not passed in --pars

npx tsx scripts/dev-auth-query.ts --player p2 new_challenge --pars '{"metaGame":"amazons","numPlayers":2,...}'
```

- `AP_DEV_TEST_PLAYERS` — override manifest path.
- `--no-defaults` — do not apply manifest `defaults` to `pars`.

Library: [`lib/test/devTestPlayers.ts`](../../lib/test/devTestPlayers.ts) (`authQueryAsPlayer`, token refresh). Sign-in helpers: [`lib/test/devAmplifyAuth.ts`](../../lib/test/devAmplifyAuth.ts) (mirrors front `amplifyAuth.js`).

## Ladder-specific Dynamo audits (read-only)

```bash
$env:ABSTRACT_PLAY_TABLE='abstract-play-dev'
$env:AWS_PROFILE='AbstractPlayDev'
npx tsx scripts/reconcile-ladder-active-counts.ts --dry-run --ladderId <uuid>
npx tsx scripts/audit-ladder-snapshot.ts <uuid>
```

## Security

- Manifest holds long-lived refresh tokens — never commit it.
- Dev accounts and dev pool only.
