import type { GameRec } from "types/index.js";
import type { ThumbnailRenderOutput } from "./thumbnailRenderRep.js";

export const THUMBNAIL_ARTIFACT_VERSION = 1 as const;
export const PLAY_SITE_ORIGIN = "https://play.abstractplay.com";

export type ThumbnailSourceMeta = {
    metaGame: string;
    gameId: string;
    cbit: "0" | "1";
    sampleKind: "active" | "completed";
    generatedAt: string;
    moveUrl: string;
};

export type ThumbnailArtifactV1 = {
    v: typeof THUMBNAIL_ARTIFACT_VERSION;
    source: ThumbnailSourceMeta;
    render: ThumbnailRenderOutput;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThumbnailSourceMeta(value: unknown): value is ThumbnailSourceMeta {
    if (!isRecord(value)) {
        return false;
    }
    return (
        typeof value.metaGame === "string" &&
        typeof value.gameId === "string" &&
        (value.cbit === "0" || value.cbit === "1") &&
        (value.sampleKind === "active" || value.sampleKind === "completed") &&
        typeof value.generatedAt === "string" &&
        typeof value.moveUrl === "string"
    );
}

export function cbitFromGameSk(sk: string): "0" | "1" {
    const parts = sk.split("#");
    return parts[1] === "1" ? "1" : "0";
}

export function buildMoveUrl(metaGame: string, cbit: "0" | "1", gameId: string): string {
    return `${PLAY_SITE_ORIGIN}/move/${metaGame}/${cbit}/${gameId}`;
}

export function buildThumbnailSource(
    metaGame: string,
    rec: GameRec,
    sampleKind: "active" | "completed",
    generatedAt: string,
): ThumbnailSourceMeta {
    const cbit = cbitFromGameSk(rec.sk);
    return {
        metaGame,
        gameId: rec.id,
        cbit,
        sampleKind,
        generatedAt,
        moveUrl: buildMoveUrl(metaGame, cbit, rec.id),
    };
}

export function buildThumbnailArtifact(
    source: ThumbnailSourceMeta,
    render: ThumbnailRenderOutput,
): ThumbnailArtifactV1 {
    return {
        v: THUMBNAIL_ARTIFACT_VERSION,
        source,
        render,
    };
}

export type ParsedThumbnailJson = {
    render: ThumbnailRenderOutput;
    source: ThumbnailSourceMeta | null;
};

/** Unwrap v1 envelope or return legacy bare render rep. */
export function parseThumbnailJson(parsed: unknown): ParsedThumbnailJson {
    let data: unknown = parsed;
    if (typeof data === "string") {
        data = JSON.parse(data) as unknown;
        if (typeof data === "string") {
            data = JSON.parse(data) as unknown;
        }
    }
    if (!isRecord(data)) {
        throw new Error("Thumbnail JSON is not an object");
    }
    if (
        data.v === THUMBNAIL_ARTIFACT_VERSION &&
        isThumbnailSourceMeta(data.source) &&
        data.render !== undefined
    ) {
        return {
            render: data.render as ThumbnailRenderOutput,
            source: data.source,
        };
    }
    return {
        render: data as ThumbnailRenderOutput,
        source: null,
    };
}

/** Embed provenance for SVG inspection (not used by the renderer). */
export function injectSourceIntoSvg(svg: string, source: ThumbnailSourceMeta): string {
    const json = JSON.stringify(source);
    const escaped = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const metadata = `<metadata id="ap-thumbnail-source">${escaped}</metadata>`;
    const openEnd = svg.indexOf(">");
    if (openEnd === -1) {
        return svg;
    }
    return `${svg.slice(0, openEnd + 1)}${metadata}${svg.slice(openEnd + 1)}`;
}
