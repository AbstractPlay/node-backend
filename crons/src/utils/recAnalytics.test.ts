import { describe, expect, it } from "vitest";
import {
    aggregateEvents,
    buildAnalyticsSummary,
    buildMarkdownReport,
    buildRollingSlice,
    emptyAnalyticsSlice,
    mergeSlices,
    parseRecommendationEvent,
    type NormalizedRecEvent,
    type RawDdbItem,
} from "./recAnalytics.js";

function showEvent(overrides: Partial<NormalizedRecEvent> & { batchId: string }): NormalizedRecEvent {
    return {
        eventTimeMs: 1_700_000_000_000,
        event: "rec_show",
        surface: "gamePicker",
        tier: "warm",
        gameIds: ["go", "hex"],
        reasons: ["content", "cooccur"],
        ...overrides,
    };
}

function clickEvent(overrides: Partial<NormalizedRecEvent> & { batchId: string }): NormalizedRecEvent {
    return {
        eventTimeMs: 1_700_000_000_100,
        event: "rec_click",
        surface: "gamePicker",
        tier: "warm",
        metaGame: "go",
        position: 0,
        reasonType: "content",
        ...overrides,
    };
}

function challengeEvent(overrides: Partial<NormalizedRecEvent> & { batchId: string }): NormalizedRecEvent {
    return {
        eventTimeMs: 1_700_000_000_200,
        event: "rec_challenge",
        surface: "gamePicker",
        tier: "warm",
        metaGame: "go",
        ...overrides,
    };
}

describe("aggregateEvents", () => {
    it("joins show + click + challenge on the same batchId", () => {
        const slice = aggregateEvents([
            showEvent({ batchId: "batch-a" }),
            clickEvent({ batchId: "batch-a" }),
            challengeEvent({ batchId: "batch-a" }),
        ]);

        expect(slice.totals).toEqual({ shows: 1, clicks: 1, challenges: 1 });
        expect(slice.rates.ctr).toBe(1);
        expect(slice.rates.challengeRate).toBe(1);
        expect(slice.rates.endToEndRate).toBe(1);
        expect(slice.topClickedMetaGames).toEqual([{ metaGame: "go", count: 1 }]);
        expect(slice.topChallengedMetaGames).toEqual([{ metaGame: "go", count: 1 }]);
    });

    it("computes CTR by reasonType across batches", () => {
        const slice = aggregateEvents([
            showEvent({ batchId: "batch-a" }),
            clickEvent({ batchId: "batch-a", reasonType: "content" }),
            showEvent({ batchId: "batch-b" }),
            clickEvent({ batchId: "batch-b", reasonType: "cooccur", metaGame: "hex", position: 1 }),
        ]);

        expect(slice.totals.shows).toBe(2);
        expect(slice.totals.clicks).toBe(2);
        expect(slice.rates.ctr).toBe(1);
        expect(slice.byReasonType.content?.clicks).toBe(1);
        expect(slice.byReasonType.cooccur?.clicks).toBe(1);
        expect(slice.byReasonType.content?.showReasons).toBe(2);
        expect(slice.byReasonType.cooccur?.showReasons).toBe(2);
    });

    it("flags orphan clicks without a matching show", () => {
        const slice = aggregateEvents([
            clickEvent({ batchId: "orphan-batch" }),
        ]);

        expect(slice.totals).toEqual({ shows: 0, clicks: 1, challenges: 0 });
        expect(slice.dataQuality.orphanClicks).toBe(1);
    });

    it("returns zeros for an empty day without throwing", () => {
        const slice = aggregateEvents([]);
        expect(slice.totals).toEqual({ shows: 0, clicks: 0, challenges: 0 });
        expect(slice.rates).toEqual({ ctr: 0, challengeRate: 0, endToEndRate: 0 });
        expect(slice.dataQuality.eventsProcessed).toBe(0);
    });
});

describe("mergeSlices / rolling windows", () => {
    it("merges two daily slices into correct 7d totals", () => {
        const dayOne = aggregateEvents([
            showEvent({ batchId: "d1-a" }),
            clickEvent({ batchId: "d1-a" }),
        ]);
        const dayTwo = aggregateEvents([
            showEvent({ batchId: "d2-a" }),
            showEvent({ batchId: "d2-b" }),
        ]);

        const rolling = buildRollingSlice(
            [
                { date: "2026-08-11", slice: dayOne },
                { date: "2026-08-12", slice: dayTwo },
            ],
            "2026-08-12",
            7,
        );

        expect(rolling.totals).toEqual({ shows: 3, clicks: 1, challenges: 0 });
        expect(rolling.rates.ctr).toBeCloseTo(1 / 3);
    });

    it("buildAnalyticsSummary includes rolling7d and rolling30d", () => {
        const windowSlice = aggregateEvents([showEvent({ batchId: "w1" })]);
        const daily = [{ date: "2026-08-12", slice: windowSlice }];
        const summary = buildAnalyticsSummary(windowSlice, daily, "2026-08-12");

        expect(summary.totals.shows).toBe(1);
        expect(summary.rolling7d.totals.shows).toBe(1);
        expect(summary.rolling30d.totals.shows).toBe(1);
    });

    it("mergeSlices is additive across slices", () => {
        const a = aggregateEvents([showEvent({ batchId: "a" })]);
        const b = aggregateEvents([showEvent({ batchId: "b" }), clickEvent({ batchId: "b" })]);
        const merged = mergeSlices([a, b]);
        expect(merged.totals).toEqual({ shows: 2, clicks: 1, challenges: 0 });
    });
});

describe("parseRecommendationEvent", () => {
    it("parses a valid rec_show row", () => {
        const item: RawDdbItem = {
            pk: "RECOMMENDS#user-1",
            sk: "1700000000000#abc",
            event: "rec_show",
            batchId: "batch-1",
            surface: "explore",
            tier: "cold",
            gameIds: ["go"],
            reasons: ["content"],
        };
        const parsed = parseRecommendationEvent(item);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.event.batchId).toBe("batch-1");
            expect(parsed.event.eventTimeMs).toBe(1_700_000_000_000);
        }
    });
});

describe("buildMarkdownReport", () => {
    it("includes hybrid weight reference and handles zero shows", () => {
        const summary = buildAnalyticsSummary(emptyAnalyticsSlice(), [], "2026-08-12");
        summary.generatedAt = "2026-08-12T03:00:00.000Z";
        const md = buildMarkdownReport({ runDate: "2026-08-12", summary });

        expect(md).toContain("No recommendation impressions");
        expect(md).toContain("Review notes for agents");
        expect(md).toContain("0.45");
        expect(md).toContain("cooccur");
    });
});
