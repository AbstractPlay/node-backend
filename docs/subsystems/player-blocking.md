# Player blocking

## Behavior

A player can block another player. Blocking is **bidirectional in storage** but asymmetric in effect:

- The blocker maintains a list of blocked ids (returned in `me` as `blocked`).
- The blocked player does not see the blocker's **open (standing) challenges** when using the auth `standing_challenges` query.

Blocking does **not** affect:

- Direct (named) challenges
- Accepted games or game chat
- Automated tournaments or organizer events
- The public `standing_challenges` query (unauthenticated clients see all open challenges)

## Record types

Two records are written per block:

```
pk: PLAYER#<blockingPlayerId>   sk: BLOCKED#<blockedPlayerId>
pk: PLAYER#<blockedPlayerId>    sk: BLOCKEDBY#<blockingPlayerId>
```

Both are deleted on unblock.

## Queries

| Query | Purpose | `pars` |
|-------|---------|--------|
| `block_player` | Create block records | `playerId` |
| `unblock_player` | Delete block records | `playerId` |
| `me` | Returns `blocked: string[]` of blocked player ids | — |
| `standing_challenges` (auth) | Filters challenges where `challenger.id` is in the requester's `BLOCKEDBY` set | `metaGame` |

Self-blocking is rejected.

## Implementation notes

- Block lists are queried with `begins_with` on `sk` (`BLOCKED#` / `BLOCKEDBY#`).
- Open-challenge filtering runs in `standingChallenges()` when `userId` is provided (auth path only).

## Related

- [Challenges](/backend/subsystems/challenges/)
- [Database schema](/backend/database-schema/)
- [Auth queries](/backend/api/auth-queries/)
