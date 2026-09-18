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
2. **List open** — `standing_challenges` per metaGame, or `all_standing_challenges` site-wide (public unfiltered; auth filters blocked issuers).
3. **Respond** — `challenge_response` accept/decline; accepted players join `players` list.
4. **Revoke** — `challenge_revoke` by challenger (cancels the whole challenge).
5. **Game start** — when enough players accept, a `GAME` record is created.

### Multi-player seats (`numPlayers > 2`)

Challenges track **`openSlots`**: seats anyone may fill (listed on open challenges when `openSlots > 0` on a direct challenge). Named invitees stay on **`challengees`** until they accept or decline.

- **Leave / decline** (not revoke): frees a seat (`openSlots++` on direct challenges; standing challenges update `players` in place). The challenge **stays** active except **2-player direct** decline, which still removes the whole challenge.
- **Closed issue**: first opponent required; further seats may be named or open (`openSlots`). All-open multi-player challenges use **`standing: true`** (open type), not closed with every seat open.
- **Discoverability**: direct challenges with `openSlots > 0` upsert a **`STANDINGCHALLENGE#<metaGame>`** listing projection (`fillableDirect: true`) for the game’s open-challenge list.
- **Uniqueness**: each user id may appear at most once among `players` and `challengees` (the challenger is seated once in `players`). Join and persist paths reject duplicates.

Standing challenges for two-player games support a `duration` field: `0` = indefinite; `>0` = expires after that many acceptances.

## Player blocking interaction

Blocking affects **open challenges only**:

- Auth `standing_challenges` and `all_standing_challenges` hide challenges issued by players who have blocked the requester.
- Direct challenges, accepted games, and tournaments are **not** affected.

See [Player blocking](/backend/subsystems/player-blocking/).

## Direct-challenge opt-out

Users may set `settings.all.noDirectChallenges` to `true` (dashboard checkbox; stored via `update_user_settings`). When a **direct** challenge names a human challengee who opted out:

- The challenge is not announced to challengees (no challenged email/push/`challengeIssued` in-app notification).
- The server immediately processes a decline as that user, with a fixed system note (`DirectChallengeOptOutNote`) sent to the challenger via the normal rejection path.
- If multiple human challengees are named and any one opted out, the whole challenge is declined (same as a manual decline today).

Open/standing challenges and the player block list are **not** affected.

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
| `standing_challenges` | public / yes | List open challenges for one metaGame |
| `all_standing_challenges` | public / yes | List all open standing challenges site-wide |
| `challenge_details` | public | Single challenge |

## Related

- [Database schema](/backend/database-schema/)
- [Games and moves](/backend/subsystems/games-and-moves/)
- [Player blocking](/backend/subsystems/player-blocking/)
