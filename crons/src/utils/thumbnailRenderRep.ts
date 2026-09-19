import type { APRenderRep } from "@abstractplay/renderer";

/** Output of `game.render()` — single frame or animation frames. */
export type ThumbnailRenderOutput = APRenderRep | APRenderRep[];

/** Pick the last frame for static thumbnail SVG rendering. */
export function coalesceRenderFrames(rep: ThumbnailRenderOutput): APRenderRep {
    const frame = Array.isArray(rep) ? rep.at(-1) : rep;
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
        throw new Error("Thumbnail render rep has no drawable frame");
    }
    return frame;
}
