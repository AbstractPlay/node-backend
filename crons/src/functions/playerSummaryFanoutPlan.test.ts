import { describe, expect, it } from "vitest";
import type { StatSummary } from "types/stats/StatSummary.js";
import {
    computePlayerSummaryInputFingerprint,
    planPlayerSummaryFanout,
} from "./playerSummaryFanoutPlan.js";
import {
    splitStatSummary,
    toGlickoStats,
    toPlayerSummarySlice,
    buildPlayerSummaryIndexesFromTiers,
} from "./summarizeHelpers.js";
import { playerSummarySliceContentHash } from "../utils/playerSummaryHash.js";

const minimalSummary = (): StatSummary => ({
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
    hoursPer: { mean: 0, median: 0, n: 0, winsorizedCount: 0, byWeek: [] },
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
});

describe("planPlayerSummaryFanout", () => {
    const generated = "2026-01-02T00:00:00.000Z";
    const tiers = () => splitStatSummary(minimalSummary(), generated);

    it("enqueues all candidates when no prior hashes exist", () => {
        const { players, ratings } = tiers();
        const plan = planPlayerSummaryFanout({ generated, playersTier: players, ratingsTier: ratings });
        expect(plan.candidateCount).toBe(2);
        expect(plan.enqueuedCount).toBe(2);
        expect(plan.skippedCount).toBe(0);
        expect(plan.messages).toHaveLength(2);
        expect(plan.inputUnchanged).toBe(false);
        expect(Object.keys(plan.contentHashes)).toEqual(["a", "b"]);
    });

    it("skips users whose slice hash is unchanged", () => {
        const { players, ratings } = tiers();
        const first = planPlayerSummaryFanout({ generated, playersTier: players, ratingsTier: ratings });
        const second = planPlayerSummaryFanout({
            generated: "2026-02-02T00:00:00.000Z",
            playersTier: players,
            ratingsTier: ratings,
            previousHashes: first.contentHashes,
            previousInputFingerprint: first.inputFingerprint,
        });
        expect(second.enqueuedCount).toBe(0);
        expect(second.skippedCount).toBe(2);
        expect(second.messages).toHaveLength(0);
        expect(second.inputUnchanged).toBe(true);
    });

    it("enqueues users whose substantive slice changed", () => {
        const { players, ratings } = tiers();
        const first = planPlayerSummaryFanout({ generated, playersTier: players, ratingsTier: ratings });
        const changedPlayers = {
            ...players,
            players: {
                ...players.players,
                allPlays: [
                    { user: "a", value: 6 },
                    { user: "b", value: 4 },
                ],
            },
        };
        const second = planPlayerSummaryFanout({
            generated: "2026-02-02T00:00:00.000Z",
            playersTier: changedPlayers,
            ratingsTier: ratings,
            previousHashes: first.contentHashes,
            previousInputFingerprint: first.inputFingerprint,
        });
        expect(second.inputUnchanged).toBe(false);
        expect(second.enqueuedCount).toBe(1);
        expect(second.skippedCount).toBe(1);
        expect(second.messages).toHaveLength(1);
        expect(second.messages[0]!.user).toBe("a");
    });

    it("input fingerprint ignores tier generated timestamps", () => {
        const { players, ratings } = tiers();
        const fingerprintA = computePlayerSummaryInputFingerprint(players, ratings);
        const fingerprintB = computePlayerSummaryInputFingerprint(
            { ...players, generated: "2099-01-01T00:00:00.000Z" },
            { ...ratings, generated: "2099-01-01T00:00:00.000Z" },
        );
        expect(fingerprintA).toBe(fingerprintB);
    });

    it("content hash ignores generated on slices", () => {
        const { players, ratings } = tiers();
        const indexes = buildPlayerSummaryIndexesFromTiers(players, ratings);
        const sliceA = toPlayerSummarySlice("a", "2026-01-01T00:00:00.000Z", indexes);
        const sliceB = toPlayerSummarySlice("a", "2026-02-02T00:00:00.000Z", indexes);
        expect(playerSummarySliceContentHash(sliceA)).toBe(playerSummarySliceContentHash(sliceB));
    });
});
