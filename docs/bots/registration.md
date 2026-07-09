# Bot registration and management

Bot owners manage bots through authenticated `authQuery` endpoints. Creating a bot provisions Cognito credentials and DynamoDB records in the **current stage only**.

## Create a bot

**Query:** `create_bot` (alias: `createBot`)

**Pars:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Display name (validated and reserved via `BOTNAME`) |
| `endpoint` | yes | HTTPS URL AP will call for ping, challenge, and move webhooks |

**Response (200):**

```json
{
  "clientId": "cognito-app-client-id",
  "clientSecret": "shown-only-once"
}
```

**What happens:**

1. Cognito app client created in `BOTPOOL_ID` with M2M scope.
2. `BOTNAME` record reserved for the display name.
3. `BOT` record written (`pk: BOT`, `sk: clientId`) with `name`, `endpoint`, `owner`.
4. Owner's `USER.bots` set updated.

Store `clientSecret` immediately — it is not retrievable later except via secret rotation.

Implementation: `createBot()` in [`api/abstractplay.ts`](../../api/abstractplay.ts).

## Update a bot

**Query:** `update_bot` (alias: `updateBot`)

**Pars:** `clientId`, `name`, `endpoint`, optional `description`, optional `supported` (list of `{ meta, variants }`).

Only the owner may update. Renaming goes through `BOTNAME` reservation logic.

## Delete a bot

**Query:** `delete_bot` (alias: `deleteBot`)

**Pars:** `clientId`

Deletes the Cognito client, `BOT` record, releases the display name, and removes the id from the owner's `USER.bots`.

## Secret rotation

If a `client_secret` is lost or compromised, rotate without downtime:

### 1. Begin rotation

**Query:** `begin_bot_secret_rotation` (alias: `beginBotSecretRotation`)

**Pars:** `clientId`

Returns a new `clientSecret` and `clientSecretId`. Cognito may hold two secrets briefly during rotation.

### 2. Deploy new secret

Update your bot's environment with the new secret and verify it can obtain tokens and submit moves.

### 3. Finalize rotation

**Query:** `finalize_bot_secret_rotation` (alias: `finalizeBotSecretRotation`)

**Pars:** `clientId`

Deletes the oldest Cognito client secret.

Implementation: [`lib/botSecrets.ts`](../../lib/botSecrets.ts).

## Bot record fields

`BOT` / `<clientId>`:

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `endpoint` | HTTPS webhook URL |
| `owner` | Owner's user id |
| `lastseen` | Last contact timestamp |
| `lastStatusCode` | Last HTTP status from webhook |
| `operational` | `true` if last status was 2xx |
| `description` | Optional profile text |
| `supported` | Optional list of games/variants the bot accepts |
| `pendingSecretId` | Set during secret rotation |

Bots appear in `user_names` and the owner's `me.bots` list via [`lib/participants.ts`](../../lib/participants.ts).

## Dev test bot

The platform hosts a reference bot on the dev stage at `/testBot`. It uses `TEST_BOT_CLIENT_ID` / `TEST_BOT_CLIENT_SECRET` from CI secrets. Dashboard queries `test_bot_status` and `update_test_bot` are dev-only owner tools — see [Implementation guide](/backend/bots/implementation/).

## Related

- [Bot framework overview](/backend/bots/)
- [Authentication](/backend/bots/authentication/)
- [Auth queries](/backend/api/auth-queries/) — full query table
