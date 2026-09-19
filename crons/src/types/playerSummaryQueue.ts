import type { PlayerSummarySlice } from "types/stats/StatSummaryTiers.js";

export type PlayerSummaryQueueMessage = {
    user: string;
    key: string;
    slice: PlayerSummarySlice;
};

export type PlayerSummaryManifestV1 = {
    version: 1;
    generated: string;
    expectedCount: number;
    enqueuedAt: string;
};

export type PlayerSummaryManifest = {
    version: 2;
    generated: string;
    enqueuedAt: string;
    candidateCount: number;
    expectedCount: number;
    skippedCount: number;
    inputFingerprint: string;
    contentHashes: Record<string, string>;
};

export type PlayerSummaryManifestAny = PlayerSummaryManifestV1 | PlayerSummaryManifest;

export function parsePreviousPlayerSummaryManifest(
    raw: unknown,
): { inputFingerprint?: string; contentHashes?: Record<string, string> } {
    if (raw === null || typeof raw !== "object") {
        return {};
    }
    const manifest = raw as Record<string, unknown>;
    if (manifest.version === 2) {
        const v2 = manifest as PlayerSummaryManifest;
        return {
            inputFingerprint: v2.inputFingerprint,
            contentHashes: v2.contentHashes,
        };
    }
    return {};
}
