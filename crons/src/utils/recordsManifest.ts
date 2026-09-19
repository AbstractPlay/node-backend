import type { _Object } from "@aws-sdk/client-s3";
import {
    PLAYER_SUMMARY_MANIFEST_KEY,
    PLAYER_SUMMARY_KEY_PATTERN,
    SUMMARY_MONOLITH_KEY,
    SUMMARY_PLAYERS_KEY,
    SUMMARY_RATINGS_KEY,
    SUMMARY_SITE_KEY,
} from "../constants/recordsBucket.js";

export type SummaryFileEntry = {
    key: string;
    lastModified?: string;
    size?: number;
};

export type RecordsManifestV2 = {
    version: 2;
    generated: string;
    summaryFiles: {
        monolith: SummaryFileEntry;
        site: SummaryFileEntry;
        players: SummaryFileEntry;
        ratings: SummaryFileEntry;
        playerSummaryPattern: string;
        playerManifest: SummaryFileEntry;
    };
    objects: _Object[];
};

export const REQUIRED_SUMMARY_KEYS = [
    SUMMARY_MONOLITH_KEY,
    SUMMARY_SITE_KEY,
    SUMMARY_PLAYERS_KEY,
    SUMMARY_RATINGS_KEY,
] as const;

const summaryEntry = (objectsByKey: Map<string, _Object>, key: string): SummaryFileEntry => {
    const obj = objectsByKey.get(key);
    return {
        key,
        lastModified: obj?.LastModified?.toISOString(),
        size: obj?.Size,
    };
};

export function buildRecordsManifest(objects: _Object[], generated: string): RecordsManifestV2 {
    const objectsByKey = new Map<string, _Object>();
    for (const obj of objects) {
        if (obj.Key !== undefined) {
            objectsByKey.set(obj.Key, obj);
        }
    }

    for (const key of REQUIRED_SUMMARY_KEYS) {
        if (!objectsByKey.has(key)) {
            console.warn(`Missing summary key in bucket listing: ${key}`);
        }
    }
    if (!objectsByKey.has(PLAYER_SUMMARY_MANIFEST_KEY)) {
        console.warn(`Missing player summary manifest in bucket listing: ${PLAYER_SUMMARY_MANIFEST_KEY}`);
    }

    return {
        version: 2,
        generated,
        summaryFiles: {
            monolith: summaryEntry(objectsByKey, SUMMARY_MONOLITH_KEY),
            site: summaryEntry(objectsByKey, SUMMARY_SITE_KEY),
            players: summaryEntry(objectsByKey, SUMMARY_PLAYERS_KEY),
            ratings: summaryEntry(objectsByKey, SUMMARY_RATINGS_KEY),
            playerSummaryPattern: PLAYER_SUMMARY_KEY_PATTERN,
            playerManifest: summaryEntry(objectsByKey, PLAYER_SUMMARY_MANIFEST_KEY),
        },
        objects,
    };
}
