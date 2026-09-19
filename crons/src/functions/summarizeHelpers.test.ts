import { describe, expect, it, vi } from "vitest";
import type { APGameRecord } from "@abstractplay/recranks";
import {
    GLICKO_PERIOD_MS,
    GLICKO_ESTABLISHED_RD,
    GLICKO_PROVISIONAL_RD,
    GLICKO_MIN_GAMES_ESTABLISHED,
    GLICKO_MIN_GAMES_PROVISIONAL,
    buildGlickoByGame,
    computeGlickoSiteRatings,
    computeGlickoGameCounts,
    computeGlickoSiteCounts,
    toGlickoStats,
    isGlickoProvisional,
    isGlickoEstablished,
    recordPlayerTimeout,
    timeoutStatsFromAccumulator,
    buildPlayerTimeoutHistograms,
    splitStatSummary,
    buildPlayerSummaryIndexes,
    buildPlayerSummaryIndexesFromTiers,
    collectPlayerSummaryUserIds,
    collectPlayerSummaryUserIdsFromTiers,
    toPlayerSummarySlice,
    statSummaryTierKeys,
    STAT_SUMMARY_PARTITIONED_KEYS,
    type PlayerTimeoutAccumulator,
    computeGlickoNumPeriods,
    computeHoursPerStats,
    computeReturningPlayersPerWeek,
    computeRivalryPairs,
    anonymizeRivalries,
    publishRivalries,
    enrichRivalryPairsWithDisplayNames,
    computeTimeoutHistogramRates,
    findTimeoutPlayerSeat,
    gameSupportsMultiPlayerCount,
    gameSupportsPie,
    getGlickoPeriodIndex,
    maxOf,
    medianOf,
    percentileOf,
    partitionByGlickoPeriod,
    recordHasAbandoned,
    recordHasTimeout,
    recordMoveSlotCount,
    recordRoundCount,
    recordWasPied,
    metaGameFromRecord,
    variantUidsFromRecord,
    variantComboFromRecord,
} from "./summarizeHelpers.js";
import type { StatSummary } from "types/stats/StatSummary.js";

const emptyHoursPer = () => ({
    mean: 0,
    median: 0,
    n: 0,
    winsorizedCount: 0,
    byWeek: [] as number[],
});

const minimalStatSummary = (overrides: Partial<StatSummary> = {}): StatSummary => ({
    numGames: 10,
    numPlayers: 2,
    timeoutRate: 0.1,
    abandonedRate: 0.05,
    playContext: { casual: 8, event: 2 },
    pieRates: [],
    playerCountMix: [],
    ratings: {
        highest: [
            { user: "a", game: "chess", rating: 1500, wld: [5, 3, 1], glicko: toGlickoStats(1500, 80, 0.06, 9) },
            { user: "b", game: "chess", rating: 1400, wld: [2, 6, 0], glicko: toGlickoStats(1400, 90, 0.06, 8) },
        ],
        avg: [{ user: "a", rating: 1500 }, { user: "b", rating: 1400 }],
        weighted: [{ user: "a", rating: 1500 }, { user: "b", rating: 1400 }],
        glickoByGame: [
            { user: "a", game: "chess", glicko: toGlickoStats(1500, 80, 0.06, 9) },
            { user: "b", game: "chess", glicko: toGlickoStats(1400, 90, 0.06, 8) },
        ],
        glickoSite: [],
        glickoMeta: {
            establishedRd: 110,
            provisionalRd: 200,
            minGamesEstablished: 20,
            minGamesProvisional: 10,
            periodMs: 5_184_000_000,
            generatedAt: "2026-01-01T00:00:00.000Z",
            counts: { byGame: [], site: { rated: 0, provisional: 0, established: 0 } },
        },
        playerCountsByUid: {},
    },
    topPlayers: [],
    plays: { total: [], width: [] },
    players: {
        allPlays: [{ user: "a", value: 5 }, { user: "b", value: 4 }],
        eclectic: [{ user: "a", value: 2 }],
        social: [{ user: "a", value: 3 }],
        h: [{ user: "a", value: 1 }],
        hOpp: [{ user: "b", value: 2 }],
        timeoutStats: [{ user: "a", count: 2, latestTimeoutMs: 2_000 }],
    },
    histograms: {
        all: [1, 2],
        allPlayers: [1, 2],
        meta: [],
        players: [{ user: "a", value: [1, 0] }, { user: "b", value: [0, 1] }],
        playerTimeouts: [{ user: "a", value: [1, 1] }, { user: "b", value: [0, 0] }],
        firstTimers: [1],
        returningPlayers: [0, 1],
        activeMovers: [1, 2],
        timeouts: [0.1],
        abandoned: [0.05],
    },
    recent: [],
    hoursPer: emptyHoursPer(),
    metaStats: {},
    soloMetaStats: {},
    soloSeedBoards: [],
    hMeta: [],
    geoStats: [],
    activeGeoStats: [],
    rivalries: [],
    pastDisplayNames: [],
    seasonality: {
        movesByDow: Array.from({ length: 7 }, () => 0),
        playersByDow: Array.from({ length: 7 }, () => 0),
        movesByHour: Array.from({ length: 24 }, () => 0),
        windowDays: 365,
    },
    ...overrides,
});

type Moves = APGameRecord["moves"];

describe("recordPlayerTimeout / timeoutStatsFromAccumulator", () => {
    it("aggregates count and latest timestamp per user", () => {
        const acc = new Map<string, PlayerTimeoutAccumulator>();
        recordPlayerTimeout(acc, "a", 1_000);
        recordPlayerTimeout(acc, "a", 2_500);
        recordPlayerTimeout(acc, "b", 500);
        expect(timeoutStatsFromAccumulator(acc)).toEqual([
            { user: "a", count: 2, latestTimeoutMs: 2_500 },
            { user: "b", count: 1, latestTimeoutMs: 500 },
        ]);
    });
});

describe("buildPlayerTimeoutHistograms", () => {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const earliest = 0;

    it("builds weekly buckets per user including zero-filled users", () => {
        const acc = new Map<string, PlayerTimeoutAccumulator>();
        recordPlayerTimeout(acc, "a", earliest);
        recordPlayerTimeout(acc, "a", earliest + weekMs);
        const hist = buildPlayerTimeoutHistograms(acc, ["a", "b"], earliest);
        expect(hist).toEqual([
            { user: "a", value: [1, 1] },
            { user: "b", value: [] },
        ]);
    });
});

describe("splitStatSummary", () => {
    it("partitions monolith keys across tiers without overlap", () => {
        const summary = minimalStatSummary();
        const generated = "2026-01-02T00:00:00.000Z";
        const tiers = splitStatSummary(summary, generated);
        expect(tiers.site.tier).toBe("site");
        expect(tiers.players.tier).toBe("players");
        expect(tiers.ratings.tier).toBe("ratings");
        expect(tiers.site.generated).toBe(generated);
        expect(tiers.players.players.timeoutStats).toEqual(summary.players.timeoutStats);
        expect(tiers.ratings.ratings.highest).toEqual(summary.ratings.highest);
        const tierKeys = statSummaryTierKeys(tiers.site, tiers.players, tiers.ratings);
        for (const key of STAT_SUMMARY_PARTITIONED_KEYS) {
            expect(tierKeys.has(key)).toBe(true);
        }
        expect(tierKeys.size).toBe(STAT_SUMMARY_PARTITIONED_KEYS.length);
    });
});

describe("toPlayerSummarySlice", () => {
    it("includes pastDisplayNames when present in indexes", () => {
        const summary = minimalStatSummary({
            pastDisplayNames: [{ user: "a", names: ["Alice Old"] }],
        });
        const indexes = buildPlayerSummaryIndexes(summary);
        const slice = toPlayerSummarySlice("a", "2026-01-02T00:00:00.000Z", indexes);
        expect(slice.pastDisplayNames).toEqual(["Alice Old"]);
    });

    it("returns only the requested user's rows", () => {
        const summary = minimalStatSummary();
        const generated = "2026-01-02T00:00:00.000Z";
        const indexes = buildPlayerSummaryIndexes(summary);
        const slice = toPlayerSummarySlice("a", generated, indexes);
        expect(slice.user).toBe("a");
        expect(slice.ratings.highest.every((row) => row.user === "a")).toBe(true);
        expect(slice.players.timeoutCount).toBe(2);
        expect(slice.players.latestTimeoutMs).toBe(2_000);
        expect(slice.histograms.players).toEqual([1, 0]);
        const other = toPlayerSummarySlice("b", generated, indexes);
        expect(other.ratings.highest.every((row) => row.user === "b")).toBe(true);
        expect(other.players.timeoutCount).toBeUndefined();
    });

    it("collects user ids from plays, stats, and ratings", () => {
        const users = collectPlayerSummaryUserIds(minimalStatSummary());
        expect(users).toEqual(["a", "b"]);
    });

    it("tier-based helpers match monolith-based helpers", () => {
        const summary = minimalStatSummary();
        const generated = "2026-01-02T00:00:00.000Z";
        const tiers = splitStatSummary(summary, generated);
        const monolithIndexes = buildPlayerSummaryIndexes(summary);
        const tierIndexes = buildPlayerSummaryIndexesFromTiers(tiers.players, tiers.ratings);
        expect(collectPlayerSummaryUserIdsFromTiers(tiers.players, tiers.ratings))
            .toEqual(collectPlayerSummaryUserIds(summary));
        for (const user of ["a", "b"]) {
            expect(toPlayerSummarySlice(user, generated, tierIndexes))
                .toEqual(toPlayerSummarySlice(user, generated, monolithIndexes));
        }
    });
});

describe("toGlickoStats", () => {
    it("computes rating bounds and dual provisional/established flags", () => {
        const stats = toGlickoStats(1500, 100, 0.06, 25);
        expect(stats.ratingLow).toBe(1300);
        expect(stats.ratingHigh).toBe(1700);
        expect(stats.provisional).toBe(false);
        expect(stats.established).toBe(true);
        expect(stats.n).toBe(25);
    });

    it("marks low-game-count players provisional", () => {
        const stats = toGlickoStats(1500, 80, 0.06, 5);
        expect(stats.provisional).toBe(true);
        expect(stats.established).toBe(false);
    });

    it("marks high-RD players provisional even with many games", () => {
        const stats = toGlickoStats(1500, 250, 0.06, 50);
        expect(stats.provisional).toBe(true);
        expect(stats.established).toBe(false);
    });
});

describe("isGlickoProvisional / isGlickoEstablished", () => {
    it("uses AP thresholds from constants", () => {
        expect(GLICKO_PROVISIONAL_RD).toBe(200);
        expect(GLICKO_ESTABLISHED_RD).toBe(110);
        expect(GLICKO_MIN_GAMES_PROVISIONAL).toBe(10);
        expect(GLICKO_MIN_GAMES_ESTABLISHED).toBe(20);
        expect(isGlickoProvisional(199, 15)).toBe(false);
        expect(isGlickoProvisional(201, 15)).toBe(true);
        expect(isGlickoEstablished(110, 20)).toBe(true);
        expect(isGlickoEstablished(111, 20)).toBe(false);
    });
});

describe("computeGlickoSiteRatings", () => {
    it("weights composite site rating by games played per meta", () => {
        const byGame = buildGlickoByGame([
            { user: "a", game: "chess", glicko: toGlickoStats(1600, 50, 0.06, 10) },
            { user: "a", game: "go", glicko: toGlickoStats(1400, 100, 0.06, 30) },
        ]);
        const site = computeGlickoSiteRatings(byGame);
        expect(site).toHaveLength(1);
        const entry = site[0]!;
        expect(entry.n).toBe(40);
        expect(entry.ratingLow).toBeCloseTo((1500 * 10 + 1200 * 30) / 40);
        expect(entry.provisional).toBe(false);
        expect(entry.established).toBe(true);
    });
});

describe("computeGlickoGameCounts / computeGlickoSiteCounts", () => {
    it("counts provisional and established rows per game and site", () => {
        const byGame = buildGlickoByGame([
            { user: "a", game: "chess", glicko: toGlickoStats(1500, 80, 0.06, 25) },
            { user: "b", game: "chess", glicko: toGlickoStats(1500, 250, 0.06, 5) },
            { user: "a", game: "go", glicko: toGlickoStats(1500, 80, 0.06, 3) },
        ]);
        expect(computeGlickoGameCounts(byGame)).toEqual([
            { game: "chess", rated: 2, provisional: 1, established: 1 },
            { game: "go", rated: 1, provisional: 1, established: 0 },
        ]);
        const site = computeGlickoSiteRatings(byGame);
        expect(computeGlickoSiteCounts(site)).toEqual({
            rated: 2,
            provisional: 2,
            established: 1,
        });
    });
});

describe("maxOf", () => {
    it("returns -1 for an empty array", () => {
        expect(maxOf([])).toBe(-1);
    });

    it("returns the maximum value", () => {
        expect(maxOf([3, 1])).toBe(3);
    });
});

describe("getGlickoPeriodIndex", () => {
    const oldest = 1_000_000;

    it("assigns all records to period 0 when numPeriods is 1", () => {
        expect(getGlickoPeriodIndex(oldest, oldest, GLICKO_PERIOD_MS, 1)).toBe(0);
        expect(getGlickoPeriodIndex(oldest + GLICKO_PERIOD_MS, oldest, GLICKO_PERIOD_MS, 1)).toBe(0);
    });

    it("includes records on the final period boundary", () => {
        const newest = oldest + GLICKO_PERIOD_MS;
        expect(getGlickoPeriodIndex(newest, oldest, GLICKO_PERIOD_MS, 1)).toBe(0);
    });

    it("splits records across multiple periods", () => {
        const numPeriods = 2;
        expect(getGlickoPeriodIndex(oldest, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(0);
        expect(getGlickoPeriodIndex(oldest + GLICKO_PERIOD_MS - 1, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(0);
        expect(getGlickoPeriodIndex(oldest + GLICKO_PERIOD_MS, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(1);
        expect(getGlickoPeriodIndex(oldest + 2 * GLICKO_PERIOD_MS, oldest, GLICKO_PERIOD_MS, numPeriods)).toBe(1);
    });
});

describe("computeGlickoNumPeriods", () => {
    it("returns at least one period", () => {
        expect(computeGlickoNumPeriods(0)).toBe(1);
        expect(computeGlickoNumPeriods(GLICKO_PERIOD_MS)).toBe(1);
        expect(computeGlickoNumPeriods(GLICKO_PERIOD_MS + 1)).toBe(2);
    });
});

describe("partitionByGlickoPeriod", () => {
    it("assigns every record to exactly one bucket", () => {
        const oldestMs = 0;
        const records = [
            { dateEndMs: 0 },
            { dateEndMs: GLICKO_PERIOD_MS },
            { dateEndMs: 2 * GLICKO_PERIOD_MS },
        ];
        const numPeriods = computeGlickoNumPeriods(2 * GLICKO_PERIOD_MS);
        const buckets = partitionByGlickoPeriod(records, oldestMs, GLICKO_PERIOD_MS, numPeriods);
        const assigned = buckets.flat();
        expect(assigned).toHaveLength(records.length);
        expect(assigned.map((r) => r.dateEndMs).sort((a, b) => a - b)).toEqual(
            records.map((r) => r.dateEndMs).sort((a, b) => a - b),
        );
    });
});

describe("medianOf", () => {
    it("returns undefined for an empty array", () => {
        expect(medianOf([])).toBeUndefined();
    });

    it("returns the middle value", () => {
        expect(medianOf([3, 1, 2])).toBe(2);
        expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    });
});

describe("percentileOf", () => {
    it("interpolates between sorted values", () => {
        expect(percentileOf([1, 2, 3, 4, 5], 0)).toBe(1);
        expect(percentileOf([1, 2, 3, 4, 5], 100)).toBe(5);
        expect(percentileOf([1, 2, 3, 4, 5], 50)).toBe(3);
    });
});

describe("computeHoursPerStats", () => {
    const earliestMs = 0;
    const hourMs = 60 * 60 * 1000;

    it("computes move-weighted mean and per-game median", () => {
        const stats = computeHoursPerStats([
            { dateStartMs: 0, dateEndMs: 4 * hourMs, moveSlots: 2 },
            { dateStartMs: 0, dateEndMs: 8 * hourMs, moveSlots: 2 },
        ], earliestMs);
        expect(stats.n).toBe(2);
        expect(stats.mean).toBe(3);
        expect(stats.median).toBe(3);
    });

    it("winsorizes outliers at p2 and p98", () => {
        const hourMs = 60 * 60 * 1000;
        const games = [];
        for (let i = 1; i <= 20; i++) {
            games.push({ dateStartMs: 0, dateEndMs: i * hourMs, moveSlots: 1 });
        }
        games.push({ dateStartMs: 0, dateEndMs: 10_000 * hourMs, moveSlots: 1 });
        const stats = computeHoursPerStats(games, 0);
        expect(stats.n).toBe(21);
        expect(stats.winsorizedCount).toBeGreaterThan(0);
        const uncappedMean = (Array.from({ length: 20 }, (_, i) => i + 1).reduce((a, b) => a + b, 0) + 10_000) / 21;
        expect(stats.mean).toBeLessThan(uncappedMean);
        expect(stats.median).toBeLessThan(10_000);
    });

    it("reports zero winsorized records when all rates fall within p2-p98", () => {
        const hourMs = 60 * 60 * 1000;
        const stats = computeHoursPerStats([
            { dateStartMs: 0, dateEndMs: hourMs, moveSlots: 1 },
        ], 0);
        expect(stats.winsorizedCount).toBe(0);
    });

    it("builds weekly medians aligned to completion week buckets", () => {
        const weekMs = 7 * 24 * hourMs;
        const games = [];
        for (let i = 0; i < 5; i++) {
            games.push({ dateStartMs: 0, dateEndMs: 2 * hourMs, moveSlots: 1 });
        }
        for (let i = 0; i < 5; i++) {
            games.push({ dateStartMs: weekMs, dateEndMs: weekMs + 4 * hourMs, moveSlots: 1 });
        }
        const stats = computeHoursPerStats(games, earliestMs);
        expect(stats.byWeek).toEqual([2, 4]);
    });
});

describe("computeReturningPlayersPerWeek", () => {
    it("counts users who played again after their first week", () => {
        const earliest = 0;
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const returning = computeReturningPlayersPerWeek([
            { user: "a", time: 0 },
            { user: "a", time: weekMs },
            { user: "b", time: weekMs },
        ], earliest, 1);
        expect(returning).toEqual([0, 1]);
    });
});

describe("recordWasPied", () => {
    it("detects pied and pie-invoked headers", () => {
        expect(recordWasPied({ pied: true } as APGameRecord["header"])).toBe(true);
        expect(recordWasPied({ "pie-invoked": true } as APGameRecord["header"])).toBe(true);
        expect(recordWasPied({} as APGameRecord["header"])).toBe(false);
    });
});

describe("gameSupportsPie", () => {
    it("matches pie flags", () => {
        expect(gameSupportsPie(["pie"])).toBe(true);
        expect(gameSupportsPie(["pie-even"])).toBe(true);
        expect(gameSupportsPie(["simultaneous"])).toBe(false);
    });
});

describe("gameSupportsMultiPlayerCount", () => {
    it("is true when any supported count exceeds two", () => {
        expect(gameSupportsMultiPlayerCount([2])).toBe(false);
        expect(gameSupportsMultiPlayerCount([2, 3, 4])).toBe(true);
    });
});

describe("computeRivalryPairs", () => {
    it("counts two-player pairs and filters by minimum games", () => {
        const recs = [
            { header: { players: [{ userid: "b" }, { userid: "a" }] } },
            { header: { players: [{ userid: "a" }, { userid: "b" }] } },
            { header: { players: [{ userid: "a" }, { userid: "c" }] } },
            { header: { players: [{ userid: "x" }, { userid: "y" }] } },
        ] as APGameRecord[];
        expect(computeRivalryPairs(recs, 2, 10)).toEqual([
            { userA: "a", userB: "b", n: 2 },
        ]);
    });

    it("filters by minimum games without a top-N cap", () => {
        const recs = Array.from({ length: 60 }, () => ({
            header: { players: [{ userid: "a" }, { userid: "b" }] },
        })) as APGameRecord[];
        expect(computeRivalryPairs(recs, 50)).toEqual([
            { userA: "a", userB: "b", n: 60 },
        ]);
        expect(computeRivalryPairs(recs, 50, 10)).toEqual([
            { userA: "a", userB: "b", n: 60 },
        ]);
    });

    it("ignores games without two user ids", () => {
        const recs = [
            { header: { players: [{ userid: "a" }, { userid: "b" }, { userid: "c" }] } },
            { header: { players: [{ userid: "a" }, {}] } },
        ] as APGameRecord[];
        expect(computeRivalryPairs(recs, 1, 10)).toEqual([]);
    });
});

describe("anonymizeRivalries", () => {
    it("labels pairs without exposing user ids", () => {
        expect(anonymizeRivalries([
            { userA: "secret-a", userB: "secret-b", n: 12 },
            { userA: "secret-c", userB: "secret-d", n: 8 },
        ])).toEqual([
            { rank: 1, label: "Pair 1", n: 12 },
            { rank: 2, label: "Pair 2", n: 8 },
        ]);
    });
});

describe("publishRivalries", () => {
    const pairs = [
        { userA: "a", userB: "b", n: 12 },
        { userA: "c", userB: "d", n: 8 },
        { userA: "e", userB: "f", n: 5 },
    ];
    const names = new Map([
        ["a", "Alice"],
        ["b", "Bob"],
        ["c", "Carol"],
        ["d", "Dave"],
        ["e", "Eve"],
        ["f", "Frank"],
    ]);

    it("keeps pairs anonymized when neither player opted in", () => {
        expect(publishRivalries(pairs, new Set(), names)).toEqual([
            { rank: 1, label: "Pair 1", n: 12 },
            { rank: 2, label: "Pair 2", n: 8 },
            { rank: 3, label: "Pair 3", n: 5 },
        ]);
    });

    it("keeps pairs anonymized when only one player opted in", () => {
        expect(publishRivalries(pairs, new Set(["a"]), names)).toEqual([
            { rank: 1, label: "Pair 1", n: 12 },
            { rank: 2, label: "Pair 2", n: 8 },
            { rank: 3, label: "Pair 3", n: 5 },
        ]);
    });

    it("deanonymizes pairs when both players opted in", () => {
        expect(
            publishRivalries(pairs, new Set(["a", "b", "c", "d"]), names),
        ).toEqual([
            {
                rank: 1,
                label: "Alice vs Bob",
                n: 12,
                players: [
                    { id: "a", name: "Alice" },
                    { id: "b", name: "Bob" },
                ],
            },
            {
                rank: 2,
                label: "Carol vs Dave",
                n: 8,
                players: [
                    { id: "c", name: "Carol" },
                    { id: "d", name: "Dave" },
                ],
            },
            { rank: 3, label: "Pair 3", n: 5 },
        ]);
    });

    it("preserves rank ordering", () => {
        const result = publishRivalries(pairs, new Set(["e", "f"]), names);
        expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
        expect(result[2]).toEqual({
            rank: 3,
            label: "Eve vs Frank",
            n: 5,
            players: [
                { id: "e", name: "Eve" },
                { id: "f", name: "Frank" },
            ],
        });
    });
});

describe("enrichRivalryPairsWithDisplayNames", () => {
    it("adds display names and falls back to user id when unknown", () => {
        const names = new Map([["a", "Alice"], ["b", "Bob"]]);
        expect(enrichRivalryPairsWithDisplayNames([
            { userA: "a", userB: "b", n: 7 },
            { userA: "c", userB: "d", n: 3 },
        ], names)).toEqual([
            { userA: "a", nameA: "Alice", userB: "b", nameB: "Bob", n: 7 },
            { userA: "c", nameA: "c", userB: "d", nameB: "d", n: 3 },
        ]);
    });
});

describe("computeTimeoutHistogramRates", () => {
    it("returns 0 for empty week buckets instead of NaN", () => {
        expect(computeTimeoutHistogramRates([0, 0, 1], [5, 0, 10])).toEqual([0, 0, 0.1]);
    });

    it("aligns arrays of different lengths", () => {
        expect(computeTimeoutHistogramRates([1], [2, 4])).toEqual([0.5, 0]);
    });

    it("never produces NaN", () => {
        const rates = computeTimeoutHistogramRates([0, 0, 0], [0, 0, 0]);
        expect(rates.every((r) => !Number.isNaN(r))).toBe(true);
        expect(rates).toEqual([0, 0, 0]);
    });
});

describe("recordHasAbandoned", () => {
    it("detects plain-string abandoned moves", () => {
        const moves: Moves = [["e2-e4", "e7-e5"], ["abandoned"]];
        expect(recordHasAbandoned(moves)).toBe(true);
        expect(recordHasTimeout(moves)).toBe(false);
    });

    it("detects structured abandoned moves", () => {
        const moves: Moves = [[{ move: "abandoned", result: [{ type: "gameabandoned" }] }]];
        expect(recordHasAbandoned(moves)).toBe(true);
    });

    it("does not false-positive on unrelated move text", () => {
        const moves: Moves = [["mention-timeout-in-chat"]];
        expect(recordHasTimeout(moves)).toBe(false);
        expect(recordHasAbandoned(moves)).toBe(false);
    });
});

describe("recordHasTimeout", () => {
    it("detects plain-string timeout moves", () => {
        const moves: Moves = [["e2-e4", "timeout"]];
        expect(recordHasTimeout(moves)).toBe(true);
    });

    it("detects structured timeout moves", () => {
        const moves: Moves = [[{ move: "timeout", result: [{ type: "timeout", player: 2 }] }]];
        expect(recordHasTimeout(moves)).toBe(true);
    });
});

describe("findTimeoutPlayerSeat", () => {
    it("uses seat index for full rounds", () => {
        const moves: Moves = [["e2-e4", "timeout"]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBe(1);
    });

    it("uses seat index for partial sequential rounds", () => {
        const moves: Moves = [["timeout"]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBe(0);
    });

    it("prefers structured result.player over seat index", () => {
        const moves: Moves = [[
            { move: "timeout", result: [{ type: "timeout", player: 2 }] },
            null,
        ]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBe(1);
    });

    it("returns undefined when no timeout move exists", () => {
        const moves: Moves = [["e2-e4", "e7-e5"]];
        expect(findTimeoutPlayerSeat(moves, 2)).toBeUndefined();
    });
});

describe("recordRoundCount / recordMoveSlotCount", () => {
    const legacyRec: APGameRecord = {
        header: {
            game: { name: "Test" },
            site: { name: "Abstract Play", gameid: "legacy-1" },
            "date-start": "2024-01-01T12:00:00Z",
            "date-end": "2024-01-01T13:00:00Z",
            "date-generated": "2024-01-01T13:00:00Z",
            players: [
                { name: "A", result: 1 },
                { name: "B", result: 0 },
            ],
        },
        moves: [["e4", "e5"], ["Nf3", "Nc6"], ["Bb5", "a6"]],
    };

    it("legacy records use rec.moves.length and slot sum", () => {
        expect(recordRoundCount(legacyRec)).toBe(3);
        expect(recordMoveSlotCount(legacyRec)).toBe(6);
    });

    it("skip-turn header counts non-empty rounds and slots only", () => {
        const rec: APGameRecord = {
            ...legacyRec,
            header: {
                ...legacyRec.header,
                "turn-model": "skip-turn",
            },
            moves: [
                ["m1", null],
                [null, null],
                ["m2", null],
            ],
        };
        expect(recordRoundCount(rec)).toBe(2);
        expect(recordMoveSlotCount(rec)).toBe(2);
    });
});

describe("record gameid helpers", () => {
    const INSTANCE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    function recWithGameid(gameid: string): APGameRecord {
        return {
            header: {
                game: { name: "Go", variants: ["9x9 board"] },
                site: { name: "Abstract Play", gameid },
                "date-start": "2024-01-01T12:00:00Z",
                "date-end": "2024-01-01T13:00:00Z",
                "date-generated": "2024-01-01T13:00:00Z",
                players: [
                    { name: "A", result: 1 },
                    { name: "B", result: 0 },
                ],
            },
            moves: [["e4", "e5"]],
        };
    }

    it("reads meta UID and variant codes from encoded gameids", () => {
        const rec = recWithGameid(`${INSTANCE_ID}#go:size-9`);
        expect(metaGameFromRecord(rec)).toBe("go");
        expect(variantUidsFromRecord(rec)).to.include("size-9");
        expect(variantComboFromRecord(rec)).toContain("size-9");
    });

    it("canonicalizes akimbo empty gameid variants like size-13", () => {
        const emptyRec = recWithGameid(`${INSTANCE_ID}#akimbo:`);
        emptyRec.header.game.name = "Akimbo";
        const sizedRec = recWithGameid(`${INSTANCE_ID}#akimbo:size-13`);
        sizedRec.header.game.name = "Akimbo";
        expect(variantComboFromRecord(emptyRec)).to.equal(variantComboFromRecord(sizedRec));
    });

    it("reads meta UID from legacy gameids", () => {
        const rec = recWithGameid(`go#${INSTANCE_ID}`);
        const legacy = { onLegacyGameId: vi.fn(), onLegacyVariantFallback: vi.fn() };
        expect(metaGameFromRecord(rec, legacy)).toBe("go");
        expect(legacy.onLegacyGameId).toHaveBeenCalled();
        expect(variantUidsFromRecord(rec, legacy).length).toBeGreaterThan(0);
        expect(legacy.onLegacyVariantFallback).toHaveBeenCalled();
    });
});
