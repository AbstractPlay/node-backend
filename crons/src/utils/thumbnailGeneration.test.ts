import { describe, expect, it, vi } from "vitest";
import type { GameRec } from "types/index.js";
import { ReservoirSampler } from "./ReservoirSampler.js";
import {
    THUMBNAIL_GENERATION_REPORT_LOG_PREFIX,
    buildThumbnailForMeta,
    errorMessage,
    logThumbnailProblemReport,
    pickSampleGameRec,
    type ThumbnailSamplerEntry,
} from "./thumbnailGeneration.js";

function gameRec(sk: string, id: string): GameRec {
    return {
        pk: "GAME",
        sk,
        id,
        metaGame: sk.split("#")[0]!,
        state: "stub",
        players: [{ name: "a", id: "1", time: 0 }],
    };
}

function emptySamplerEntry(): ThumbnailSamplerEntry {
    return {
        active: new ReservoirSampler<GameRec>(),
        completed: new ReservoirSampler<GameRec>(),
    };
}

describe("thumbnailGeneration", () => {
    it("errorMessage prefers Error.message", () => {
        expect(errorMessage(new Error("boom"))).toBe("boom");
        expect(errorMessage("plain")).toBe("plain");
    });

    it("pickSampleGameRec prefers active over completed", () => {
        const entry = emptySamplerEntry();
        entry.completed.add(gameRec("chess#1", "completed-id"));
        entry.active.add(gameRec("chess#0", "active-id"));

        const picked = pickSampleGameRec("chess", entry);
        expect("rec" in picked && picked.rec.id).toBe("active-id");
        expect("rec" in picked && picked.sampleKind).toBe("active");
    });

    it("pickSampleGameRec reports sample failure when reservoirs are empty", () => {
        const result = pickSampleGameRec("go", emptySamplerEntry());
        expect("failure" in result).toBe(true);
        if ("failure" in result) {
            expect(result.failure.meta).toBe("go");
            expect(result.failure.phase).toBe("sample");
            expect(result.failure.sampleKind).toBe("none");
        }
    });

    it("buildThumbnailForMeta captures render errors without throwing", () => {
        const entry = emptySamplerEntry();
        entry.active.add(gameRec("badmeta#0", "game-123"));

        const result = buildThumbnailForMeta("badmeta", entry, () => "");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.meta).toBe("badmeta");
            expect(result.failure.gameId).toBe("game-123");
            expect(result.failure.gameSk).toBe("badmeta#0");
            expect(result.failure.message.length).toBeGreaterThan(0);
        }
    });

    it("logThumbnailProblemReport emits structured JSON once", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        logThumbnailProblemReport({
            generatedCount: 2,
            samplerMetaCount: 3,
            renderFailures: [
                {
                    meta: "foo",
                    phase: "render",
                    gameSk: "foo#0",
                    gameId: "id-1",
                    sampleKind: "active",
                    message: "render blew up",
                },
            ],
            uploadFailures: [{ meta: "bar", message: "S3 denied" }],
        });

        expect(errorSpy).toHaveBeenCalled();
        const jsonLine = errorSpy.mock.calls.find((c) =>
            String(c[0]).startsWith(`${THUMBNAIL_GENERATION_REPORT_LOG_PREFIX} `),
        );
        expect(jsonLine).toBeDefined();
        const json = JSON.parse(String(jsonLine![0]).slice(THUMBNAIL_GENERATION_REPORT_LOG_PREFIX.length + 1));
        expect(json.renderFailureCount).toBe(1);
        expect(json.uploadFailureCount).toBe(1);
        expect(json.renderFailures[0].meta).toBe("foo");

        errorSpy.mockRestore();
    });

    it("logThumbnailProblemReport is silent when there are no problems", () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        logThumbnailProblemReport({
            generatedCount: 1,
            samplerMetaCount: 1,
            renderFailures: [],
            uploadFailures: [],
        });
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
