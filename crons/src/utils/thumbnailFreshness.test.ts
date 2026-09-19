import { describe, expect, it } from "vitest";
import { findThumbnailFreshnessMismatches } from "./thumbnailFreshness.js";

describe("findThumbnailFreshnessMismatches", () => {
    const jsonDate = new Date("2026-09-09T06:05:00.000Z");
    const olderSvg = new Date("2026-09-08T06:04:00.000Z");
    const newerSvg = new Date("2026-09-09T06:05:21.000Z");

    it("flags svg older than json", () => {
        const heads = new Map([
            ["rincala.json", { key: "rincala.json", lastModified: jsonDate }],
            ["rincala-light.svg", { key: "rincala-light.svg", lastModified: olderSvg }],
        ]);
        const mismatches = findThumbnailFreshnessMismatches(["rincala"], heads);
        expect(mismatches).toHaveLength(1);
        expect(mismatches[0]).toMatchObject({
            meta: "rincala",
            reason: "svg-older-than-json",
        });
    });

    it("passes when svg is newer than json", () => {
        const heads = new Map([
            ["frogger.json", { key: "frogger.json", lastModified: jsonDate }],
            ["frogger-light.svg", { key: "frogger-light.svg", lastModified: newerSvg }],
        ]);
        expect(findThumbnailFreshnessMismatches(["frogger"], heads)).toHaveLength(0);
    });

    it("flags missing svg", () => {
        const heads = new Map([
            ["rincala.json", { key: "rincala.json", lastModified: jsonDate }],
        ]);
        const mismatches = findThumbnailFreshnessMismatches(["rincala"], heads);
        expect(mismatches[0].reason).toBe("missing-svg");
    });

    it("skips broken metas", () => {
        const heads = new Map([
            ["broken.json", { key: "broken.json", lastModified: jsonDate }],
        ]);
        expect(findThumbnailFreshnessMismatches(["broken"], heads, ["broken"])).toHaveLength(0);
    });

    it("ignores metas with no json object", () => {
        expect(findThumbnailFreshnessMismatches(["missing"], new Map())).toHaveLength(0);
    });
});
