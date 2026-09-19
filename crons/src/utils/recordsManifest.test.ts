import { describe, expect, it, vi } from "vitest";
import type { _Object } from "@aws-sdk/client-s3";
import { buildRecordsManifest, REQUIRED_SUMMARY_KEYS } from "./recordsManifest.js";
import {
    PLAYER_SUMMARY_MANIFEST_KEY,
    SUMMARY_MONOLITH_KEY,
    SUMMARY_PLAYERS_KEY,
    SUMMARY_RATINGS_KEY,
    SUMMARY_SITE_KEY,
} from "../constants/recordsBucket.js";

const obj = (key: string, size: number): _Object => ({
    Key: key,
    Size: size,
    LastModified: new Date("2026-01-02T07:30:00.000Z"),
});

describe("buildRecordsManifest", () => {
    it("wraps bucket listing with summaryFiles entries", () => {
        const contents: _Object[] = [
            obj(SUMMARY_MONOLITH_KEY, 4_000_000),
            obj(SUMMARY_SITE_KEY, 330_000),
            obj(SUMMARY_PLAYERS_KEY, 1_100_000),
            obj(SUMMARY_RATINGS_KEY, 2_400_000),
            obj(PLAYER_SUMMARY_MANIFEST_KEY, 120),
            obj("player/alice-summary.json", 4_000),
        ];
        const manifest = buildRecordsManifest(contents, "2026-01-02T07:30:00.000Z");
        expect(manifest.version).toBe(2);
        expect(manifest.summaryFiles.monolith).toEqual({
            key: SUMMARY_MONOLITH_KEY,
            lastModified: "2026-01-02T07:30:00.000Z",
            size: 4_000_000,
        });
        expect(manifest.summaryFiles.playerSummaryPattern).toBe("player/{userId}-summary.json");
        expect(manifest.objects).toHaveLength(6);
    });

    it("warns when required summary keys are missing", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        buildRecordsManifest([obj("ALL.json", 1)], "2026-01-02T07:30:00.000Z");
        for (const key of REQUIRED_SUMMARY_KEYS) {
            expect(warn).toHaveBeenCalledWith(`Missing summary key in bucket listing: ${key}`);
        }
        expect(warn).toHaveBeenCalledWith(
            `Missing player summary manifest in bucket listing: ${PLAYER_SUMMARY_MANIFEST_KEY}`,
        );
        warn.mockRestore();
    });
});
