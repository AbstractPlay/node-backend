# Challenges

## Direct vs standing (open)

| Type | `standing` flag | Storage | Visibility |
|------|-----------------|---------|------------|
| **Direct** | `false` | `CHALLENGE` + user `challenges_issued` / `challenges_received` | Named challengees only |
| **Standing (open)** | `true` | `STANDINGCHALLENGE#<metaGame>` + user `challenges_standing` | Listed publicly per game |

Direct challenges send email/push to challengees. Standing challenges appear on the open-challenges list for a metaGame.

## SDG-style standing (`REALSTANDING`)

Separate from per-challenge standing records: `REALSTANDING` / `<userid>` stores a user's standing-request preferences (which games they want open challenges for, with optional limits). Updated via `update_standing`.

## Flow

1. **Issue** — `new_challenge` with challenger, challengees (direct), variants, clocks, etc.
2. **List open** — `standing_challenges` (public unfiltered; auth filters blocked issuers).
3. **Respond** — `challenge_response` accept/decline; accepted players join `players` list.
4. **Revoke** — `challenge_revoke` by challenger.
5. **Game start** — when enough players accept, a `GAME` record is created.

Standing challenges for two-player games support a `duration` field: `0` = indefinite; `>0` = expires after that many acceptances.

## Player blocking interaction

Blocking affects **open challenges only**:

- Auth `standing_challenges` hides challenges issued by players who have blocked the requester.
- Direct challenges, accepted games, and tournaments are **not** affected.

See [Player blocking](/backend/subsystems/player-blocking/).

## Bots

Bot challengees are notified via the `bot-outbound` queue (HTTPS webhook), not email. Bots respond via their endpoint; moves go through `botQuery`.

## Record types

```
CHALLENGE / <challengeid>
STANDINGCHALLENGE#<metaGame> / <challengeid>
REALSTANDING / <userid>
```

User records hold sets: `challenges_issued`, `challenges_received`, `challenges_accepted`, `challenges_standing`.

## Queries

| Query | Auth | Purpose |
|-------|------|---------|
| `new_challenge` | yes | Create challenge |
| `challenge_response` | yes | Accept/decline |
| `challenge_revoke` | yes | Cancel |
| `standing_challenges` | public / yes | List open challenges |
| `challenge_details` | public | Single challenge |

## Related

- [Database schema](/backend/database-schema/)
- [Games and moves](/backend/subsystems/games-and-moves/)
- [Player blocking](/backend/subsystems/player-blocking/)
