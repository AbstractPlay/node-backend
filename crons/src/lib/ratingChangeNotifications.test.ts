import { describe, expect, it } from "vitest";
import type { GlickoMeta } from "types/stats/GlickoStats.js";
import type { StatSummaryRatings } from "types/stats/StatSummaryTiers.js";
import type { UserGameRating } from "types/stats/UserGameRating.js";
import { GLICKO_MIN_GAMES_PROVISIONAL } from "../functions/summarizeHelpers.js";
import {
    buildRatingChangeSnapshot,
    diffRatingChanges,
    filterCandidates,
    filterCandidatesByInAppPrefs,
    MIN_RATING_DELTA,
    RATINGS_NOTIFICATION_BASELINE,
    toNotificationItems,
    type RatingNotificationSnapshot,
} from "./ratingChangeNotifications.js";

function glickoRow(
    user: string,
    game: string,
    ratingLow: number,
    n: number,
    provisional = false,
    rd = 60,
): UserGameRating {
    return {
        user,
        game,
        rating: ratingLow + 100,
        wld: [n, 0, 0],
        glicko: {
            rating: ratingLow + 100,
            rd,
            volatility: 0.06,
            ratingLow,
            ratingHigh: ratingLow + 200,
            provisional,
            established: !provisional,
            n,
        },
    };
}

function snapshotEntry(
    ratingLow: number,
    n: number,
    rd = 60,
    provisional = false,
): { ratingLow: number; rd: number; provisional: boolean; n: number } {
    return { ratingLow, rd, provisional, n };
}

function minimalGlickoMeta(): GlickoMeta {
    return {
        establishedRd: 110,
        provisionalRd: 200,
        minGamesEstablished: 20,
        minGamesProvisional: GLICKO_MIN_GAMES_PROVISIONAL,
        periodMs: 86400000,
        generatedAt: "2026-08-25T06:00:00.000Z",
        counts: {
            byGame: [],
            site: { rated: 0, provisional: 0, established: 0 },
        },
    };
}

function ratingsSummary(
    highest: UserGameRating[],
    generatedAt = "2026-08-25T06:00:00.000Z",
): StatSummaryRatings {
    return {
        generated: generatedAt,
        tier: "ratings",
        ratings: {
            highest,
            avg: [],
            weighted: [],
            glickoByGame: [],
            glickoSite: [],
            glickoMeta: { ...minimalGlickoMeta(), generatedAt },
            playerCountsByUid: {},
        },
    };
}

const constants = {
    minRatingDelta: MIN_RATING_DELTA,
    minGamesProvisional: GLICKO_MIN_GAMES_PROVISIONAL,
};

describe("buildRatingChangeSnapshot", () => {
    it("indexes highest rows by user and game label", () => {
        const summary = ratingsSummary([
            glickoRow("alice", "chess (no variants)", 1200, 10),
            glickoRow("alice", "go (9x9|handicap)", 1170, 5),
        ]);
        const snapshot = buildRatingChangeSnapshot(summary, summary.ratings.glickoMeta.generatedAt);
        expect(snapshot.baseline).toBe(RATINGS_NOTIFICATION_BASELINE);
        expect(snapshot.entries["alice|chess (no variants)"]).toEqual(
            snapshotEntry(1200, 10),
        );
        expect(snapshot.entries["alice|go (9x9|handicap)"]).toEqual(
            snapshotEntry(1170, 5),
        );
    });
});

describe("filterCandidates gates", () => {
    const prev: RatingNotificationSnapshot = {
        generatedAt: "2026-08-24T06:20:00.000Z",
        summaryGeneratedAt: "2026-08-24T06:00:00.000Z",
        baseline: RATINGS_NOTIFICATION_BASELINE,
        entries: {
            "alice|chess (no variants)": snapshotEntry(1190, 10, 80),
            "bob|chess (no variants)": snapshotEntry(1100, 8),
            "carol|chess (no variants)": snapshotEntry(1000, 3, 120, true),
            "dave|chess (no variants)": snapshotEntry(900, 2),
            "eve|chess (no variants)": snapshotEntry(800, 15),
            "frank|chess (no variants)": snapshotEntry(700, 12),
            "grace|chess (no variants)": snapshotEntry(600, 20),
            "henry|chess (no variants)": snapshotEntry(500, 11),
            "ivy|chess (no variants)": snapshotEntry(400, 16),
            "jack|chess (no variants)": snapshotEntry(300, 17),
            "kate|chess (no variants)": snapshotEntry(200, 18),
            "leo|chess (no variants)": snapshotEntry(100, 19),
            "mary|chess (no variants)": snapshotEntry(50, 20),
        },
    };

    it("skips when n unchanged", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1250, 10),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedNoActivity).toBe(1);
    });

    it("skips when delta below threshold", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1193, 11),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedBelowThreshold).toBe(1);
    });

    it("notifies when n increased and delta meets threshold", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1200, 11),
        ]);
        const { candidates } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({
            userId: "alice",
            metaGameUid: "chess",
            variants: [],
            oldRating: 1190,
            newRating: 1200,
            oldRd: 80,
            newRd: 60,
            oldProvisional: false,
            newProvisional: false,
            delta: 10,
        });
    });

    it("skips provisional players below minGamesProvisional", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("carol", "chess (no variants)", 1100, 4, true),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedProvisional).toBe(1);
    });

    it("skips bot users", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1200, 11),
        ]);
        const { candidates, stats } = filterCandidates(diffRows, new Set(["alice"]), constants);
        expect(candidates).toHaveLength(0);
        expect(stats.skippedBot).toBe(1);
    });

    it("emits one notification for multiple games in same pool (aggregate delta)", () => {
        const diffRows = diffRatingChanges(prev, [
            glickoRow("alice", "chess (no variants)", 1210, 15),
        ]);
        const { candidates } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.delta).toBe(20);
    });

    it("emits notifications for all qualifying different pools (no per-user cap)", () => {
        const multiPrev: RatingNotificationSnapshot = {
            generatedAt: "2026-08-24T06:20:00.000Z",
            summaryGeneratedAt: "2026-08-24T06:00:00.000Z",
            baseline: RATINGS_NOTIFICATION_BASELINE,
            entries: {
                "alice|chess (no variants)": snapshotEntry(1000, 5),
                "alice|go (9x9|handicap)": snapshotEntry(1000, 5),
                "alice|go (19x19)": snapshotEntry(1000, 5),
                "alice|shogi (no variants)": snapshotEntry(1000, 5),
                "alice|xiangqi (no variants)": snapshotEntry(1000, 5),
            },
        };
        const diffRows = diffRatingChanges(multiPrev, [
            glickoRow("alice", "chess (no variants)", 1020, 6),
            glickoRow("alice", "go (9x9|handicap)", 1020, 6),
            glickoRow("alice", "go (19x19)", 1020, 6),
            glickoRow("alice", "shogi (no variants)", 1020, 6),
            glickoRow("alice", "xiangqi (no variants)", 1020, 6),
        ]);
        const { candidates } = filterCandidates(diffRows, new Set(), constants);
        expect(candidates).toHaveLength(5);
    });
});

describe("filterCandidatesByInAppPrefs", () => {
    const candidate = {
        userId: "alice",
        gameLabel: "chess (no variants)",
        metaGameUid: "chess",
        variants: [] as string[],
        oldRating: 1000,
        newRating: 1020,
        oldRd: 80,
        newRd: 70,
        oldProvisional: false,
        newProvisional: false,
        delta: 20,
    };

    it("skips users who disabled ratingChange in-app notifications", () => {
        const settings = new Map([
            ["alice", { all: { inAppNotifications: { ratingChange: false } } }],
        ]);
        const { candidates, skippedInAppPrefs } = filterCandidatesByInAppPrefs(
            [candidate],
            settings,
        );
        expect(candidates).toHaveLength(0);
        expect(skippedInAppPrefs).toBe(1);
    });

    it("keeps users with default or enabled prefs", () => {
        const { candidates, skippedInAppPrefs } = filterCandidatesByInAppPrefs(
            [candidate],
            new Map(),
        );
        expect(candidates).toHaveLength(1);
        expect(skippedInAppPrefs).toBe(0);
    });
});

describe("toNotificationItems", () => {
    it("matches node-backend ratingChange body shape", () => {
        const items = toNotificationItems([
            {
                userId: "alice",
                gameLabel: "go (9x9|handicap)",
                metaGameUid: "go",
                variants: ["9x9", "handicap"],
                oldRating: 1100,
                newRating: 1120,
                oldRd: 90,
                newRd: 70,
                oldProvisional: true,
                newProvisional: false,
                delta: 20,
            },
        ], 1_700_000_000_000);
        expect(items).toHaveLength(1);
        expect(items[0]?.pk).toBe("NOTIFICATION#alice");
        expect(items[0]?.body).toEqual({
            type: "ratingChange",
            metaGame: "go",
            variants: ["9x9", "handicap"],
            gameId: "",
            oldRating: 1100,
            newRating: 1120,
            oldRd: 90,
            newRd: 70,
            oldProvisional: true,
            newProvisional: false,
            delta: 20,
        });
        expect(items[0]?.expiresAt).toBeGreaterThan(1_700_000_000);
    });
});

describe("first run and idempotent re-run", () => {
    it("first run builds snapshot with no prior entries to diff against", () => {
        const summary = ratingsSummary([glickoRow("alice", "chess (no variants)", 1200, 1)]);
        const snapshot = buildRatingChangeSnapshot(summary, summary.ratings.glickoMeta.generatedAt);
        expect(Object.keys(snapshot.entries)).toHaveLength(1);
        expect(snapshot.baseline).toBe(RATINGS_NOTIFICATION_BASELINE);
        expect(snapshot.summaryGeneratedAt).toBe("2026-08-25T06:00:00.000Z");
    });

    it("re-seeds when prior snapshot baseline is stale", () => {
        const generatedAt = "2026-08-25T06:00:00.000Z";
        const stale: RatingNotificationSnapshot = {
            generatedAt: "2026-08-24T06:20:00.000Z",
            summaryGeneratedAt: "2026-08-24T06:00:00.000Z",
            baseline: RATINGS_NOTIFICATION_BASELINE - 1,
            entries: {
                "alice|chess (no variants)": snapshotEntry(900, 5),
            },
        };
        const nextSummary = ratingsSummary([glickoRow("alice", "chess (no variants)", 1250, 12)], generatedAt);
        const diff = diffRatingChanges(stale, nextSummary.ratings.highest);
        expect(diff[0]?.delta).toBeGreaterThan(100);
        expect(stale.baseline).not.toBe(RATINGS_NOTIFICATION_BASELINE);
    });

    it("idempotent when summaryGeneratedAt unchanged", () => {
        const generatedAt = "2026-08-25T06:00:00.000Z";
        const prev = buildRatingChangeSnapshot(
            ratingsSummary([glickoRow("alice", "chess (no variants)", 1200, 11)], generatedAt),
            generatedAt,
        );
        const nextSummary = ratingsSummary([glickoRow("alice", "chess (no variants)", 1250, 12)], generatedAt);
        expect(nextSummary.ratings.glickoMeta.generatedAt).toBe(prev.summaryGeneratedAt);
    });
});
