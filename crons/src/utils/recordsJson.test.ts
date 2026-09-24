import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    RECORDS_JSON_CACHE_CONTROL,
    RECORDS_MANIFEST_CACHE_CONTROL,
    RECORDS_ROBOTS_TXT,
    buildRecordsJsonPutInput,
    buildRecordsRobotsPutInput,
} from "./recordsJson.js";

const staticRobotsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../static/records-robots.txt",
);

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

    it("publishes robots.txt that blocks all crawlers", () => {
        const fromFile = readFileSync(staticRobotsPath, "utf8").replace(/\r\n/g, "\n");
        expect(RECORDS_ROBOTS_TXT).toBe(fromFile);
        const input = buildRecordsRobotsPutInput();
        expect(input.Key).toBe("robots.txt");
        expect(input.ContentType).toBe("text/plain; charset=utf-8");
        expect(String(input.Body)).toContain("Disallow: /");
    });
});
