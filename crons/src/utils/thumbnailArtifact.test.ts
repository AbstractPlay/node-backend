import { describe, expect, it } from "vitest";
import type { GameRec } from "types/index.js";
import {
    buildMoveUrl,
    buildThumbnailArtifact,
    buildThumbnailSource,
    cbitFromGameSk,
    injectSourceIntoSvg,
    parseThumbnailJson,
} from "./thumbnailArtifact.js";

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

describe("thumbnailArtifact", () => {
    it("cbitFromGameSk reads active vs completed shard", () => {
        expect(cbitFromGameSk("hive#0#abc")).toBe("0");
        expect(cbitFromGameSk("hive#1#abc")).toBe("1");
        expect(cbitFromGameSk("hive#0")).toBe("0");
    });

    it("buildThumbnailSource sets moveUrl", () => {
        const source = buildThumbnailSource(
            "hive",
            gameRec("hive#1#gid", "gid"),
            "completed",
            "2026-10-17T12:00:00.000Z",
        );
        expect(source.moveUrl).toBe(buildMoveUrl("hive", "1", "gid"));
        expect(source.sampleKind).toBe("completed");
    });

    it("parseThumbnailJson unwraps v1 envelope", () => {
        const render = { board: { width: 1 }, legend: {}, pieces: "" };
        const source = buildThumbnailSource(
            "go",
            gameRec("go#0#x", "x"),
            "active",
            "2026-10-17T00:00:00.000Z",
        );
        const artifact = buildThumbnailArtifact(source, render);
        const parsed = parseThumbnailJson(artifact);
        expect(parsed.source?.gameId).toBe("x");
        expect(parsed.render).toEqual(render);
    });

    it("parseThumbnailJson treats legacy bare rep as render only", () => {
        const legacy = { board: { style: "squares" }, legend: { A: {} }, pieces: "A" };
        const parsed = parseThumbnailJson(legacy);
        expect(parsed.source).toBeNull();
        expect(parsed.render).toEqual(legacy);
    });

    it("parseThumbnailJson handles double-stringified legacy body", () => {
        const legacy = { board: {}, legend: {}, pieces: "" };
        const wrapped = JSON.stringify(JSON.stringify(legacy));
        const parsed = parseThumbnailJson(wrapped);
        expect(parsed.source).toBeNull();
        expect(parsed.render).toEqual(legacy);
    });

    it("injectSourceIntoSvg inserts metadata after svg open tag", () => {
        const source = buildThumbnailSource(
            "cannon",
            gameRec("cannon#0#g1", "g1"),
            "active",
            "2026-10-17T00:00:00.000Z",
        );
        const out = injectSourceIntoSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', source);
        expect(out).toContain('<metadata id="ap-thumbnail-source">');
        expect(out).toContain("g1");
        expect(out.indexOf("<metadata")).toBeGreaterThan(0);
    });
});
