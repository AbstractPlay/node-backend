import type { APRenderComposite, APRenderRep } from "@abstractplay/renderer";

/** Output of `game.render()` — single frame, animation frames, or composite board. */
export type ThumbnailRenderOutput = APRenderRep | APRenderRep[] | APRenderComposite;

export type ThumbnailDrawable =
    | { kind: "single"; rep: APRenderRep }
    | { kind: "composite"; rep: APRenderComposite };

export function isThumbnailComposite(rep: ThumbnailRenderOutput): rep is APRenderComposite {
    return (
        typeof rep === "object" &&
        rep !== null &&
        !Array.isArray(rep) &&
        (rep as APRenderComposite).kind === "composite"
    );
}

/** Pick the last frame for static thumbnail SVG rendering (not for composite). */
export function coalesceRenderFrames(rep: APRenderRep | APRenderRep[]): APRenderRep {
    const frame = Array.isArray(rep) ? rep.at(-1) : rep;
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
        throw new Error("Thumbnail render rep has no drawable frame");
    }
    return frame;
}

/** Route thumbnail JSON to either `render()` or `renderComposite()`. */
export function resolveThumbnailDrawable(rep: ThumbnailRenderOutput): ThumbnailDrawable {
    if (isThumbnailComposite(rep)) {
        return { kind: "composite", rep };
    }
    return { kind: "single", rep: coalesceRenderFrames(rep) };
}
