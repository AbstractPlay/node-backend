import { describe, expect, it } from "vitest";
import { gameRecordIsUnrated, hasUnratedVariant } from "./recordUnrated.js";

describe("hasUnratedVariant", () => {
    it("returns true for arimaa free placement variant", () => {
        expect(hasUnratedVariant("arimaa", ["free"])).toBe(true);
    });

    it("returns false for a normal variant combo", () => {
        expect(hasUnratedVariant("archimedes", ["8x10"])).toBe(false);
    });

    it("returns false for unknown meta game", () => {
        expect(hasUnratedVariant("not-a-real-game", ["free"])).toBe(false);
    });
});

describe("gameRecordIsUnrated", () => {
    it("returns false when rated is true and variants are not unrated", () => {
        expect(gameRecordIsUnrated("archimedes", ["8x10"], true)).toBe(false);
    });

    it("returns true when rated is false", () => {
        expect(gameRecordIsUnrated("archimedes", ["8x10"], false)).toBe(true);
    });

    it("returns true when rated is missing", () => {
        expect(gameRecordIsUnrated("archimedes", ["8x10"], undefined)).toBe(true);
    });

    it("returns true when rated is true but a variant forces unrated", () => {
        expect(gameRecordIsUnrated("arimaa", ["free"], true)).toBe(true);
    });
});
