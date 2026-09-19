import { describe, expect, it } from "vitest";
import type { APRenderRep } from "@abstractplay/renderer";
import { coalesceRenderFrames } from "./thumbnailRenderRep.js";

describe("coalesceRenderFrames", () => {
    const frameA = { renderer: "stacking-offset", pieces: "A" } as unknown as APRenderRep;
    const frameB = { renderer: "stacking-offset", pieces: "B" } as unknown as APRenderRep;

    it("returns a single rep unchanged", () => {
        expect(coalesceRenderFrames(frameA)).toBe(frameA);
    });

    it("returns the last frame from a multiframe array", () => {
        expect(coalesceRenderFrames([frameA, frameB])).toBe(frameB);
    });

    it("throws when no drawable frame exists", () => {
        expect(() => coalesceRenderFrames([])).toThrow(/no drawable frame/);
    });
});
