import { createHash } from "node:crypto";
import type { PlayerSummarySlice } from "types/stats/StatSummaryTiers.js";

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${parts.join(",")}}`;
}

export function stableJsonHash(value: unknown): string {
    return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function playerSummarySliceContentHash(slice: PlayerSummarySlice): string {
    const { generated: _generated, ...content } = slice;
    return stableJsonHash(content);
}
