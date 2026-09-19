import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { GameFactory } from "@abstractplay/gameslib";
import { decompressGameState, isCompressedGameState } from "./gameState.js";

const smallState = '{"game":"saltire","numplayers":2}';

describe("decompressGameState", () => {
    it("passes through small JSON state unchanged", () => {
        expect(decompressGameState(smallState)).toBe(smallState);
        expect(isCompressedGameState(smallState)).toBe(false);
    });

    it("decompresses gz-prefixed backend state", () => {
        const compressed = "gz:" + gzipSync(Buffer.from(smallState, "utf8")).toString("base64");
        expect(isCompressedGameState(compressed)).toBe(true);
        expect(decompressGameState(compressed)).toBe(smallState);
    });

    it("decompresses legacy base64 gzip without prefix", () => {
        const legacy = gzipSync(Buffer.from(smallState, "utf8")).toString("base64");
        expect(isCompressedGameState(legacy)).toBe(true);
        expect(decompressGameState(legacy)).toBe(smallState);
    });

    it("GameFactory accepts decompressed state", () => {
        const engine = GameFactory("archimedes", undefined, ["8x10"]);
        expect(engine).toBeDefined();
        const serialized = engine!.serialize();
        const compressed = "gz:" + gzipSync(Buffer.from(serialized, "utf8")).toString("base64");
        const restored = GameFactory("archimedes", decompressGameState(compressed), ["8x10"]);
        expect(restored).toBeDefined();
        expect(restored!.metaGame).toBe("archimedes");
    });
});
