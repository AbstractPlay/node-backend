# Retract a meta game

Policy for removed meta games lives in **gameslib** [`retractedGames.json`](https://github.com/AbstractPlay/gameslib/blob/develop/src/retractedGames.json). Each entry sets independent knobs:

| Field | Values | Effect |
|-------|--------|--------|
| `availability` | `playable`, `hiddenProd`, `hiddenAll` | Catalog, Lab, challenges, `/games/:uid` (front + public API) |
| `recordsGeneration` | `include`, `omit` | `records` Lambda: skip or archive `GAME` rows from the Dynamo dump |
| `publishStats` | `true`, `false` | `summarize`, stats UI, co-occurrence recommendations |
| `archiveMetadata` | name, playercounts, variants | Labels when the engine is gone but `include` + stats stay public |

**DynamoDB is never modified** by retraction. `omit` only stops new S3 archive output; existing `GAME` rows remain in the table.

## Recipe: broken game (Binar-class)

Designer wants the game **gone from code** and **off public surfaces**, historical Dynamo rows kept but not re-archived.

1. Remove engine, locales, and tests from gameslib (no tombstone in `gameinfo`).
2. Add registry entry, for example:

```json
{
  "mygame": {
    "availability": "hiddenAll",
    "recordsGeneration": "omit",
    "publishStats": false,
    "reason": "broken",
    "removedAt": "YYYY-MM-DD",
    "archiveMetadata": { "name": "My Game", "playercounts": [2], "variants": [] }
  }
}
```

3. Publish gameslib; run `npm run sync-deps` in node-backend and front.
4. Deploy crons + API + front.
5. Run **records** then **summarize** (or wait for the daily pipeline). `records` skips dump rows, rewrites `ALL.json` without the UID, and **deletes orphan** `meta/{uid}.json`.
6. Optional one-time cleanup before deploy: delete stale `meta/{uid}.json` on `records.abstractplay.com` and re-run summarize.

### Rights-holder demo checklist

- No `src/games/{uid}.ts` on main; only `retractedGames.json` mentions the UID.
- Registry shows `recordsGeneration: omit` and `publishStats: false`.
- Stats `/stats/games` has no row after pipeline run.

## Recipe: licence lapse

Play forbidden everywhere (including dev), but **batch records and public stats** continue with stable names after engine removal.

```json
{
  "mygame": {
    "availability": "hiddenAll",
    "recordsGeneration": "include",
    "publishStats": true,
    "reason": "licence",
    "removedAt": "YYYY-MM-DD",
    "archiveMetadata": {
      "name": "My Game",
      "playercounts": [2],
      "variants": [{ "uid": "foo", "group": "board" }]
    }
  }
}
```

Remove playable code from gameslib. `records` uses [`archiveGameRecord.ts`](../src/utils/archiveGameRecord.ts) to build `APGameRecord` headers from stored Dynamo state + `archiveMetadata` when `GameFactory` is unavailable.

## Pipeline touchpoints

| Job | Behaviour |
|-----|-----------|
| [`records.ts`](../src/functions/records.ts) | Skips `omit` rows; post-pass [`pruneOrphanMetaShards`](../src/utils/pruneMetaShards.ts) |
| [`summarize.ts`](../src/functions/summarize.ts) | Scans `ALL.json` only; loads meta shards for UIDs in the scan with `publishStats: true` |
| [`records-cooccur.ts`](../src/functions/records-cooccur.ts) | Drops unreleased meta games from co-play sets |
| Front [`gameOptions.js`](https://github.com/AbstractPlay/front/blob/develop/src/lib/gameOptions.js) | `isCatalogVisible` + `isSummaryStatsVisible` |

## Do not use `experimental` alone

`experimental` hides prod catalog only. It does not omit records, prune S3, or hide stats. Use the retraction registry instead.
