import { describe, expect, it } from "vitest";
import {
    RECORDS_JSON_CACHE_CONTROL,
    RECORDS_MANIFEST_CACHE_CONTROL,
    buildRecordsJsonPutInput,
} from "./recordsJson.js";

describe("recordsJson", () => {
    it("sets application/json and default cache control for batch JSON", () => {
        const input = buildRecordsJsonPutInput("_summary.json", { ok: true });
        expect(input.ContentType).toBe("application/json");
        expect(input.CacheControl).toBe(RECORDS_JSON_CACHE_CONTROL);
        expect(input.CacheControl).toBe("public, max-age=0, must-revalidate");
    });

    it("allows manifest-specific cache control", () => {
        const input = buildRecordsJsonPutInput("_manifest.json", {}, {
            cacheControl: RECORDS_MANIFEST_CACHE_CONTROL,
        });
        expect(input.CacheControl).toBe("no-cache");
    });
});
