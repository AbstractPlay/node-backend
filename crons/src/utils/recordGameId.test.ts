import { describe, expect, it } from "vitest";
import {
    encodeRecordGameId,
    parseRecordGameId,
    variantComboKey,
} from "./recordGameId.js";

const UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("variantComboKey", () => {
    it("returns empty string for no variants", () => {
        expect(variantComboKey([])).toBe("");
    });

    it("sorts and joins variant UIDs", () => {
        expect(variantComboKey(["handicap", "9x9"])).toBe("9x9|handicap");
    });
});

describe("encodeRecordGameId", () => {
    it("encodes with sorted variant UIDs", () => {
        expect(encodeRecordGameId(UUID, "go", ["handicap", "9x9"])).toBe(
            `${UUID}#go:9x9|handicap`,
        );
    });

    it("encodes with trailing colon when no variants", () => {
        expect(encodeRecordGameId(UUID, "chess", [])).toBe(`${UUID}#chess:`);
    });

    it("canonicalizes unsorted input", () => {
        const a = encodeRecordGameId(UUID, "go", ["b", "a"]);
        const b = encodeRecordGameId(UUID, "go", ["a", "b"]);
        expect(a).toBe(b);
        expect(a).toBe(`${UUID}#go:a|b`);
    });
});

describe("parseRecordGameId", () => {
    it("round-trips encoded ids with variants", () => {
        const encoded = encodeRecordGameId(UUID, "go", ["9x9", "handicap"]);
        expect(parseRecordGameId(encoded)).toEqual({
            instanceId: UUID,
            metaGame: "go",
            variantUids: ["9x9", "handicap"],
            legacy: false,
        });
    });

    it("round-trips encoded ids without variants", () => {
        const encoded = encodeRecordGameId(UUID, "chess", []);
        expect(parseRecordGameId(encoded)).toEqual({
            instanceId: UUID,
            metaGame: "chess",
            variantUids: [],
            legacy: false,
        });
    });

    it("parses legacy metaGame#uuid format", () => {
        expect(parseRecordGameId(`go#${UUID}`)).toEqual({
            instanceId: UUID,
            metaGame: "go",
            variantUids: [],
            legacy: true,
        });
    });

    it("sorts variant UIDs from encoded ids", () => {
        const parsed = parseRecordGameId(`${UUID}#go:handicap|9x9`);
        expect(parsed?.variantUids).toEqual(["9x9", "handicap"]);
    });

    it("returns undefined for empty or malformed ids", () => {
        expect(parseRecordGameId("")).toBeUndefined();
        expect(parseRecordGameId("legacy-1")).toBeUndefined();
        expect(parseRecordGameId("not-a-uuid#go:")).toBeUndefined();
        expect(parseRecordGameId(`go#not-a-uuid`)).toBeUndefined();
        expect(parseRecordGameId(`${UUID}#:`)).toBeUndefined();
    });
});
