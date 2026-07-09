# Bot authentication

Traffic is authenticated in both directions.

## Bot → AP (OAuth client credentials)

When you register a bot, the backend provisions a Cognito app client in the stage's **bot pool** and returns `clientId` and `clientSecret` once (from `create_bot`). The bot's player id equals the Cognito `clientId` (JWT `sub`).

### Step 1: Fetch an access token

POST to the stage token URL with `Content-Type: application/x-www-form-urlencoded`:

| Parameter | Value |
|-----------|-------|
| `grant_type` | `client_credentials` |
| `client_id` | Your bot's client id |
| `client_secret` | Your bot's client secret |
| `scope` | Stage OAuth scope (see [Bot framework overview](/backend/bots/)) |

Example:

```bash
curl -X POST "$BOT_TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=YOUR_OAUTH_SCOPE"
```

Response:

```json
{
  "access_token": "eyJraWQiOi...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

Reference implementation: [`lib/botClient.ts`](../../lib/botClient.ts) `fetchAccessToken()`.

### Step 2: Call botQuery

Include the token on every `/botQuery` request:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Step 3: Handle expiration

- Cache the token in memory; do not request a new token on every move.
- Tokens typically expire in 3600 seconds. The reference client refreshes 60 seconds early.
- On HTTP `401`, discard the cached token, fetch a new one, and retry once.

### Security

- Treat `client_secret` like a password — environment variables or a secret manager only.
- Never commit secrets to version control.
- Use [secret rotation](/backend/bots/registration/#secret-rotation) if a secret is lost or exposed.

## AP → bot (Ed25519 request signing)

Every outbound POST from AP to your webhook includes three headers:

| Header | Description |
|--------|-------------|
| `X-Signature-Timestamp` | Unix seconds when AP signed the request |
| `X-Signature-Nonce` | One-time random string |
| `X-Signature` | Base64 Ed25519 signature |

### Verification steps

1. **Replay protection** — reject if the timestamp is older than 5 minutes relative to your server clock.
2. **Rebuild the signing string** — concatenate with periods (`.`):
   ```
   <timestamp>.<nonce>.<raw request body>
   ```
   Use the **raw** HTTP body bytes. Do not parse and re-serialize JSON; whitespace or key order changes will break verification.
3. **Verify** — check the signature against AP's Ed25519 public key.

AP's public key is published at `https://play.abstractplay.com/ap-public-key.txt`. The reference verifier also accepts `AP_BOT_PUBLIC_KEY` env override.

Reference implementation: [`lib/botVerify.ts`](../../lib/botVerify.ts) `verifyBotRequest()`.

### Signing on the AP side

Outbound payloads are signed in [`lib/botSigning.ts`](../../lib/botSigning.ts) before `postToBot()` in [`lib/botOutbound.ts`](../../lib/botOutbound.ts).

## API Gateway note

The `botQuery` endpoint uses a Cognito authorizer configured with the bot OAuth **scope**. M2M access tokens must include that scope; otherwise API Gateway returns `401` before the Lambda runs. See the troubleshooting notes in [`lib/botClient.ts`](../../lib/botClient.ts).

## Related

- [Protocol](/backend/bots/protocol/)
- [Registration](/backend/bots/registration/)
- [Bot queries](/backend/api/bot-queries/)
