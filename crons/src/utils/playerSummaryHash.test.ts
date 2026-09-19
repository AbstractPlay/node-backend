import { describe, expect, it } from "vitest";
import { playerSummarySliceContentHash, stableJsonHash } from "./playerSummaryHash.js";

describe("stableJsonHash", () => {
    it("is independent of object key order", () => {
        const a = stableJsonHash({ b: 2, a: 1 });
        const b = stableJsonHash({ a: 1, b: 2 });
        expect(a).toBe(b);
    });

    it("produces different hashes for different values", () => {
        expect(stableJsonHash({ a: 1 })).not.toBe(stableJsonHash({ a: 2 }));
    });
});

describe("playerSummarySliceContentHash", () => {
    const baseSlice = {
        generated: "2026-01-01T00:00:00.000Z",
        user: "alice",
        players: { allPlays: 5 },
        histograms: { players: [1, 0] },
        ratings: { highest: [] },
    };

    it("excludes generated from the hash", () => {
        const hashA = playerSummarySliceContentHash({
            ...baseSlice,
            generated: "2026-01-01T00:00:00.000Z",
        });
        const hashB = playerSummarySliceContentHash({
            ...baseSlice,
            generated: "2026-02-02T00:00:00.000Z",
        });
        expect(hashA).toBe(hashB);
    });

    it("changes when substantive fields change", () => {
        const hashA = playerSummarySliceContentHash(baseSlice);
        const hashB = playerSummarySliceContentHash({
            ...baseSlice,
            players: { allPlays: 6 },
        });
        expect(hashA).not.toBe(hashB);
    });
});
