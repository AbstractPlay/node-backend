import { describe, expect, it } from "vitest";
import { computeMoveSeasonality, computeWeeklyActiveMovers, alignWeeklyActiveMovers } from "./moveSeasonality.js";

describe("computeMoveSeasonality", () => {
    it("bins moves and unique players by UTC day and hour", () => {
        const monday = Date.parse("2026-01-05T15:30:00.000Z");
        const mondayLater = Date.parse("2026-01-05T16:00:00.000Z");
        const result = computeMoveSeasonality([
            { player: "a", time: monday },
            { player: "a", time: mondayLater },
            { player: "b", time: mondayLater },
        ], 365);
        expect(result.movesByDow[1]).toBe(3);
        expect(result.playersByDow[1]).toBe(2);
        expect(result.movesByHour[15]).toBe(1);
        expect(result.movesByHour[16]).toBe(2);
        expect(result.windowDays).toBe(365);
    });
});

describe("computeWeeklyActiveMovers", () => {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const originMs = 0;

    it("counts distinct players per seven-day bucket from origin", () => {
        const result = computeWeeklyActiveMovers([
            { player: "a", time: 1000 },
            { player: "a", time: 2000 },
            { player: "b", time: weekMs + 1000 },
        ], originMs);
        expect(result.originMs).toBe(0);
        expect(result.byWeek).toEqual([1, 1]);
    });
});

describe("alignWeeklyActiveMovers", () => {
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    it("pads to summarize maxBucket when origins match", () => {
        expect(alignWeeklyActiveMovers(
            { originMs: 0, byWeek: [3, 5] },
            0,
            3,
        )).toEqual([3, 5, 0, 0]);
    });

    it("offsets buckets when origins differ", () => {
        expect(alignWeeklyActiveMovers(
            { originMs: weekMs, byWeek: [4] },
            0,
            2,
        )).toEqual([0, 4, 0]);
    });
});
