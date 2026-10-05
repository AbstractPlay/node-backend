import { GameFactory } from "@abstractplay/gameslib";
import type { GameRec } from "types/index.js";
import { decompressGameState } from "./gameState.js";
import { resolveRenderLabels } from "./resolveRenderLabels.js";
import type { ThumbnailRenderOutput } from "./thumbnailRenderRep.js";
import type { ReservoirSampler } from "./ReservoirSampler.js";

export type ThumbnailSamplerEntry = {
    active: ReservoirSampler<GameRec>;
    completed: ReservoirSampler<GameRec>;
};

export type ThumbnailGenerationPhase = "sample" | "instantiate" | "strip" | "render" | "labels";

export type ThumbnailGenerationFailure = {
    meta: string;
    phase: ThumbnailGenerationPhase;
    gameSk: string;
    gameId: string;
    sampleKind: "active" | "completed" | "none";
    message: string;
};

export type ThumbnailUploadFailure = {
    meta: string;
    message: string;
};

/** Prefix for CloudWatch Logs filter patterns (full line includes JSON payload). */
export const THUMBNAIL_GENERATION_REPORT_LOG_PREFIX = "THUMBNAIL_GENERATION_REPORT";

export function errorMessage(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

function failureContext(
    meta: string,
    phase: ThumbnailGenerationPhase,
    rec: GameRec | undefined,
    sampleKind: "active" | "completed" | "none",
    message: string,
): ThumbnailGenerationFailure {
    return {
        meta,
        phase,
        gameSk: rec?.sk ?? "",
        gameId: rec?.id ?? "",
        sampleKind,
        message,
    };
}

export function pickSampleGameRec(
    meta: string,
    entry: ThumbnailSamplerEntry,
): { rec: GameRec; sampleKind: "active" | "completed" } | { failure: ThumbnailGenerationFailure } {
    const active = entry.active.getSample();
    if (active.length > 0) {
        return { rec: active[0], sampleKind: "active" };
    }
    const completed = entry.completed.getSample();
    if (completed.length > 0) {
        return { rec: completed[0], sampleKind: "completed" };
    }
    return {
        failure: failureContext(
            meta,
            "sample",
            undefined,
            "none",
            "No active or completed games in reservoir (failsafe: skip meta)",
        ),
    };
}

export function buildThumbnailForMeta(
    meta: string,
    entry: ThumbnailSamplerEntry,
    t: (key: string, params?: Record<string, unknown>) => string,
): { ok: true; output: ThumbnailRenderOutput } | { ok: false; failure: ThumbnailGenerationFailure } {
    const picked = pickSampleGameRec(meta, entry);
    if ("failure" in picked) {
        return { ok: false, failure: picked.failure };
    }
    const { rec, sampleKind } = picked;

    let phase: ThumbnailGenerationPhase = "instantiate";
    try {
        let g = GameFactory(meta, decompressGameState(rec.state));
        if (g === undefined) {
            return {
                ok: false,
                failure: failureContext(meta, "instantiate", rec, sampleKind, "GameFactory returned undefined"),
            };
        }

        phase = "strip";
        const stripped = g.serialize({ strip: true });
        g = GameFactory(meta, stripped);
        if (g === undefined) {
            return {
                ok: false,
                failure: failureContext(meta, "strip", rec, sampleKind, "GameFactory returned undefined after strip"),
            };
        }

        phase = "render";
        const rep = g.render({}) as ThumbnailRenderOutput;

        phase = "labels";
        const resolved = resolveRenderLabels(rep, rec.players, (key, params) => String(t(key, params ?? {})));

        return { ok: true, output: resolved };
    } catch (err) {
        return {
            ok: false,
            failure: failureContext(meta, phase, rec, sampleKind, errorMessage(err)),
        };
    }
}

export function logThumbnailProblemReport(args: {
    renderFailures: ThumbnailGenerationFailure[];
    uploadFailures: ThumbnailUploadFailure[];
    generatedCount: number;
    samplerMetaCount: number;
}): void {
    const { renderFailures, uploadFailures, generatedCount, samplerMetaCount } = args;
    const problemCount = renderFailures.length + uploadFailures.length;
    if (problemCount === 0) {
        return;
    }

    const payload = {
        kind: THUMBNAIL_GENERATION_REPORT_LOG_PREFIX,
        generatedCount,
        samplerMetaCount,
        renderFailureCount: renderFailures.length,
        uploadFailureCount: uploadFailures.length,
        renderFailures,
        uploadFailures,
    };
    console.error(`${THUMBNAIL_GENERATION_REPORT_LOG_PREFIX} ${JSON.stringify(payload)}`);

    for (const f of renderFailures) {
        console.error(
            `Thumbnail render skipped: meta=${f.meta} phase=${f.phase} gameSk=${f.gameSk} gameId=${f.gameId} sample=${f.sampleKind}: ${f.message}`,
        );
    }
    for (const f of uploadFailures) {
        console.error(`Thumbnail upload failed: meta=${f.meta}: ${f.message}`);
    }
}
