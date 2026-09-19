import { describe, expect, it } from "vitest";
import {
    buildCooccurArtifact,
    computePmi,
    incrementPairCounts,
    pairKey,
    unionCoPlaySet,
} from "./cooccurPmi.js";

describe("pairKey", () => {
    it("orders meta games lexicographically", () => {
        expect(pairKey("go", "amazons")).toBe("amazons|go");
        expect(pairKey("amazons", "go")).toBe("amazons|go");
    });
});

describe("unionCoPlaySet", () => {
    it("merges played and starred meta games", () => {
        const set = unionCoPlaySet(["go"], ["chess", "go"]);
        expect([...set].sort()).toEqual(["chess", "go"]);
    });
});

describe("incrementPairCounts", () => {
    it("counts each unordered pair once per player", () => {
        const counts = new Map<string, number>();
        incrementPairCounts(new Set(["go", "amazons", "hex"]), counts);
        expect(counts.get("amazons|go")).toBe(1);
        expect(counts.get("go|hex")).toBe(1);
        expect(counts.get("amazons|hex")).toBe(1);
        expect(counts.size).toBe(3);
    });
});

describe("computePmi", () => {
    it("returns higher PMI when co-play is disproportionate", () => {
        const high = computePmi(10, 20, 20, 100);
        const low = computePmi(2, 20, 20, 100);
        expect(high).toBeGreaterThan(low);
    });
});

describe("buildCooccurArtifact", () => {
    it("filters pairs below minCooccurrence", () => {
        const artifact = buildCooccurArtifact(
            [new Set(["go", "amazons"]), new Set(["go", "hex"])],
            { minCooccurrence: 5, includeStarredBoost: false },
        );
        expect(artifact.games.go ?? []).toHaveLength(0);
    });

    it("emits PMI neighbors when pairs meet the threshold", () => {
        const players = [
            ...Array.from({ length: 5 }, () => new Set(["go", "amazons"])),
            ...Array.from({ length: 3 }, () => new Set(["go"])),
            ...Array.from({ length: 2 }, () => new Set(["hex"])),
        ];
        const artifact = buildCooccurArtifact(players, {
            minCooccurrence: 5,
            topK: 20,
            includeStarredBoost: false,
            generatedAt: "2026-08-13T00:00:00.000Z",
        });
        expect(artifact.generatedAt).toBe("2026-08-13T00:00:00.000Z");
        expect(artifact.includeStarredBoost).toBe(false);
        const goNeighbors = artifact.games.go ?? [];
        expect(goNeighbors.some((n) => n.metaGame === "amazons" && n.count >= 5)).toBe(true);
        const amazonsNeighbor = goNeighbors.find((n) => n.metaGame === "amazons");
        expect(amazonsNeighbor!.pmi).toBeGreaterThan(0);
    });

    it("starred boost adds co-play pairs without completed games", () => {
        const artifact = buildCooccurArtifact(
            [unionCoPlaySet(["go"], ["chess"])],
            { minCooccurrence: 1, includeStarredBoost: true },
        );
        const goNeighbors = artifact.games.go ?? [];
        expect(goNeighbors.some((n) => n.metaGame === "chess")).toBe(true);
    });

    it("caps neighbors at topK by PMI", () => {
        const coPlay = new Set(["a", "b", "c", "d", "e", "f"]);
        const players = Array.from({ length: 10 }, () => new Set(coPlay));
        const artifact = buildCooccurArtifact(players, {
            minCooccurrence: 5,
            topK: 2,
            includeStarredBoost: false,
        });
        for (const neighbors of Object.values(artifact.games)) {
            expect(neighbors.length).toBeLessThanOrEqual(2);
        }
    });
});
