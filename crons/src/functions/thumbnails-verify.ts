import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { gameinfo, type APGamesInformation } from "@abstractplay/gameslib";
import type { Handler } from "aws-lambda";
import { THUMB_BUCKET, THUMBNAIL_BROKEN_METAS } from "../utils/thumbnailConfig.js";
import {
    findThumbnailFreshnessMismatches,
    type ObjectHead,
} from "../utils/thumbnailFreshness.js";

const s3 = new S3Client({ region: "us-east-1" });

async function headObject(bucket: string, key: string): Promise<ObjectHead | null> {
    try {
        const response = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (!response.LastModified) {
            return null;
        }
        return { key, lastModified: response.LastModified };
    } catch (err) {
        const code = (err as { name?: string }).name;
        if (code === "NotFound" || code === "NoSuchKey") {
            return null;
        }
        throw err;
    }
}

export const handler: Handler = async () => {
    const metas = ([...gameinfo.values()] as APGamesInformation[])
        .filter((rec) => !rec.flags.includes("experimental"))
        .map((rec) => rec.uid);

    const heads = new Map<string, ObjectHead>();
    for (const meta of metas) {
        if (THUMBNAIL_BROKEN_METAS.includes(meta)) {
            continue;
        }
        for (const suffix of [".json", "-light.svg"]) {
            const key = `${meta}${suffix}`;
            const head = await headObject(THUMB_BUCKET, key);
            if (head) {
                heads.set(key, head);
            }
        }
    }

    const mismatches = findThumbnailFreshnessMismatches(metas, heads, THUMBNAIL_BROKEN_METAS);
    if (mismatches.length === 0) {
        console.log(`Thumbnail freshness OK for ${metas.length} production metas`);
        return { ok: true, checked: metas.length, mismatches: [] };
    }

    console.error(
        `Thumbnail SVG freshness check failed for ${mismatches.length} meta(s):\n`
        + JSON.stringify(mismatches, null, 2),
    );
    const summary = mismatches
        .map((m) => `${m.meta} (${m.reason}: json=${m.jsonLastModified}, svg=${m.svgLastModified ?? "missing"})`)
        .join("; ");
    throw new Error(`Thumbnail SVG freshness check failed: ${summary}`);
};
