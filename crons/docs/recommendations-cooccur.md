# Recommendation co-occurrence (`records-cooccur`)

Nightly batch artifact for the hybrid game recommender on the front end. Computes **PMI-normalized co-occurrence** between meta-games from player play history, with an optional **stars boost**.

## Output

| Key | Producer |
|-----|----------|
| `recommendations/cooccur.json` | `records-cooccur` |

Public URL: `https://records.abstractplay.com/recommendations/cooccur.json`

## Schedule

**Daily 03:00 UTC** — runs in parallel with `records`, `records-move-times`, `records-ttm`, and `tournament-data`. Reads the latest completed DynamoDB ION dump (same pattern as other dump consumers). Does **not** depend on `player/*.json` from `records` (those are written in the same parallel window).

Picked up by `records-manifest` at 04:00 UTC (or 07:30 after summarize and player-summary fan-out).

## Inputs

| Source (ION dump) | Field | Use |
|-------------------|-------|-----|
| Completed games `pk=GAME`, `sk` contains `#1#` | `metaGame`, `players[].id` | Per player: set of completed meta-games |
| `pk=USER` | `sk` (user id), `stars[]` | Optional boost: starred meta-games |

### Stars boost

For each player, the co-play set is:

```
coPlaySet = completedMetaGames ∪ starredMetaGames
```

Starred games count as co-played with each other and with completed games, even when the player has not finished a game in that meta-game. This matches the `user_names` / profile `stars` signal described in the recommendation design.

Set `includeStarredBoost: true` in the artifact when stars were unioned in (always true for the current job).

## Algorithm

1. For each player with a non-empty `coPlaySet`, increment counts for every unordered pair `(A, B)` in the set.
2. `count(A)` = number of players whose `coPlaySet` contains `A`.
3. `N` = number of players with a non-empty `coPlaySet`.
4. PMI:

   ```
   PMI(A, B) = log( count(A,B) * N / (count(A) * count(B)) )
   ```

5. Keep pairs with `count(A,B) >= 5` (`DEFAULT_MIN_COOCCURRENCE`).
6. For each game `A`, store the top 20 neighbors by PMI descending.

Implementation: [`src/utils/cooccurPmi.ts`](../src/utils/cooccurPmi.ts) (pure functions + unit tests). Handler: [`src/functions/records-cooccur.ts`](../src/functions/records-cooccur.ts).

## JSON schema

```json
{
  "generatedAt": "2026-08-13T00:00:00.000Z",
  "minCooccurrence": 5,
  "includeStarredBoost": true,
  "games": {
    "go": [
      { "metaGame": "amazons", "pmi": 1.42, "count": 87 },
      { "metaGame": "hex", "pmi": 1.18, "count": 54 }
    ]
  }
}
```

| Field | Meaning |
|-------|---------|
| `generatedAt` | ISO timestamp when the artifact was written |
| `minCooccurrence` | Minimum raw pair count threshold |
| `includeStarredBoost` | Whether `stars[]` were unioned into co-play sets |
| `games` | Map of meta-game → PMI neighbors (max 20 each) |

## Front-end consumption

The front-end `useGameRecommendations` hook fetches this artifact and passes it to `buildGameRecommendations` as `cooccurData`. Missing or failed fetch degrades to content + popularity only (`cooccurScore = 0`).

Hybrid warm-tier weights (reference): 45% content, 35% co-occurrence, 15% popularity, 10% recency.

## Related

- [Records pipeline](/crons/pipeline/)
- [S3 outputs](/crons/s3-outputs/)
- [Backend recommendations subsystem](/backend/subsystems/recommendations/) — impression tracking (`RECOMMENDS#`)
- [Recommendation analytics](/crons/recommendations-analytics/) — nightly funnel rollups (ops S3)
