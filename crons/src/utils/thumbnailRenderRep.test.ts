import { describe, expect, it } from "vitest";
import type { APRenderComposite, APRenderRep } from "@abstractplay/renderer";
import {
    coalesceRenderFrames,
    isThumbnailComposite,
    resolveThumbnailDrawable,
} from "./thumbnailRenderRep.js";

const compositeFixture = {
    kind: "composite",
    layout: { arrangement: "row", gap: 1 },
    panels: [
        {
            id: "a",
            render: { renderer: "default", pieces: "A", board: { style: "squares", width: 1, height: 1 } },
        },
    ],
} as unknown as APRenderComposite;

describe("isThumbnailComposite", () => {
    it("detects composite render output", () => {
        expect(isThumbnailComposite(compositeFixture)).toBe(true);
    });

    it("rejects single reps and frame arrays", () => {
        const frame = { renderer: "plain", pieces: "A" } as unknown as APRenderRep;
        expect(isThumbnailComposite(frame)).toBe(false);
        expect(isThumbnailComposite([frame])).toBe(false);
    });
});

describe("resolveThumbnailDrawable", () => {
    const frameA = { renderer: "stacking-offset", pieces: "A" } as unknown as APRenderRep;
    const frameB = { renderer: "stacking-offset", pieces: "B" } as unknown as APRenderRep;

    it("returns composite without coalescing to a frame", () => {
        const drawable = resolveThumbnailDrawable(compositeFixture);
        expect(drawable.kind).toBe("composite");
        if (drawable.kind === "composite") {
            expect(drawable.rep).toBe(compositeFixture);
            expect(drawable.rep.kind).toBe("composite");
        }
    });

    it("coalesces multiframe output to the last frame", () => {
        const drawable = resolveThumbnailDrawable([frameA, frameB]);
        expect(drawable.kind).toBe("single");
        if (drawable.kind === "single") {
            expect(drawable.rep).toBe(frameB);
        }
    });
});

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
