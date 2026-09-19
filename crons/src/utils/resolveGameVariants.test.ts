import { describe, expect, it, vi } from "vitest";
import {
    reconcileVariantsInGameState,
    resolveGameVariantUids,
} from "./resolveGameVariants.js";

describe("resolveGameVariantUids", () => {
    it("returns state variants when both match", () => {
        expect(resolveGameVariantUids(["scrambled"], ["scrambled"])).toEqual(["scrambled"]);
    });

    it("returns record variants when state is empty (retroactive bug)", () => {
        expect(resolveGameVariantUids([], ["scrambled"])).toEqual(["scrambled"]);
        expect(resolveGameVariantUids(undefined, ["scrambled"])).toEqual(["scrambled"]);
    });

    it("returns state variants when record is empty", () => {
        expect(resolveGameVariantUids(["8x10"], [])).toEqual(["8x10"]);
        expect(resolveGameVariantUids(["8x10"], undefined)).toEqual(["8x10"]);
    });

    it("returns empty when both are empty", () => {
        expect(resolveGameVariantUids([], [])).toEqual([]);
        expect(resolveGameVariantUids(undefined, undefined)).toEqual([]);
    });

    it("prefers record and warns when both non-empty and different", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(resolveGameVariantUids(["cross"], ["scrambled"], {
            metaGame: "amazons",
            gameId: "abc",
        })).toEqual(["scrambled"]);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("canonicalizes order for comparison", () => {
        expect(resolveGameVariantUids(["b", "a"], ["a", "b"])).toEqual(["a", "b"]);
    });
});

describe("reconcileVariantsInGameState", () => {
    it("patches empty state variants from record", () => {
        const state = JSON.stringify({ game: "amazons", variants: [], stack: [] });
        const patched = reconcileVariantsInGameState(state, ["scrambled"]);
        expect(JSON.parse(patched).variants).toEqual(["scrambled"]);
    });

    it("returns original JSON when no record variants", () => {
        const state = JSON.stringify({ game: "amazons", variants: [], stack: [] });
        expect(reconcileVariantsInGameState(state, [])).toBe(state);
        expect(reconcileVariantsInGameState(state, undefined)).toBe(state);
    });

    it("returns original JSON when state already matches", () => {
        const state = JSON.stringify({ game: "amazons", variants: ["scrambled"], stack: [] });
        expect(reconcileVariantsInGameState(state, ["scrambled"])).toBe(state);
    });

    it("returns original JSON when state is invalid", () => {
        expect(reconcileVariantsInGameState("not-json", ["scrambled"])).toBe("not-json");
    });
});
