# API overview

Abstract Play's HTTP API is RPC-style: every call names a `query` (or bot `verb`) and passes parameters in `pars`.

## Endpoints

### Public: `/query`

- **Methods:** GET (query string) or POST (JSON body)
- **Auth:** None
- **Body (POST):** `{ "query": "<name>", "pars": { ... } }`
- **GET:** `?query=<name>&...pars as query params`

### Authenticated: `/authQuery`

- **Method:** POST
- **Auth:** Cognito user pool JWT (claims: `email`, `cognito:username`)
- **Body:** `{ "query": "<name>", "pars": { ... } }`
- **Identity:** `event.cognitoPoolClaims.sub` is the player id

### Bots: `/botQuery`

- **Method:** POST
- **Auth:** Cognito M2M token from the bot pool
- **Body:** `{ "verb": "<name>", ... }` (flat object, not `query`/`pars`)

## Response shape

Successful handlers return API Gateway objects:

```json
{
  "statusCode": 200,
  "body": "<JSON string>",
  "headers": { "Access-Control-Allow-Origin": "*", ... }
}
```

Errors use `formatReturnError()` with `statusCode` 500 (or 400 for validation) and a JSON `message`.

## Source of truth

| Endpoint | Switch in code |
|----------|----------------|
| Public | `module.exports.query` in [`api/abstractplay.ts`](../../api/abstractplay.ts) |
| Auth | `module.exports.authQuery` |
| Bots | `module.exports.botQuery` |

TypeScript types (`FullChallenge`, `FullUser`, `Game`, etc.) are defined in the same file. Docs list query names and intent; field-level contracts live in code.

## Auth vs public overlap

Some query names exist on both endpoints with different behavior:

| Query | Public | Auth |
|-------|--------|------|
| `standing_challenges` | Lists all open challenges for a metaGame | Same list, but filters out challenges from players who have blocked the requester |
| `get_game` | Read game (no user context) | Read game with user-specific fields |

Prefer the auth endpoint when the client is logged in.

## Query catalogs

- [Public queries](/backend/api/public-queries/)
- [Auth queries](/backend/api/auth-queries/)
- [Bot queries](/backend/api/bot-queries/)

## Maintenance

When adding a query, update the relevant catalog page and any subsystem doc in the same PR.
