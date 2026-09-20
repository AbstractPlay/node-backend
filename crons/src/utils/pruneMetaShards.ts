import {
    DeleteObjectsCommand,
    ListObjectsV2Command,
    type S3Client,
} from "@aws-sdk/client-s3";
import { listMetaShardKeys } from "../functions/summarizeMeta.js";

const DELETE_BATCH = 1000;

/**
 * Remove meta/*.json shards left from prior runs when a meta game is omitted or removed.
 */
export async function pruneOrphanMetaShards(
    s3: S3Client,
    bucket: string,
    activeMetaUids: Set<string>,
): Promise<string[]> {
    const existing = await listMetaShardKeys(s3, bucket);
    const toDelete = existing.filter((uid) => !activeMetaUids.has(uid));
    if (toDelete.length === 0) {
        return [];
    }
    for (let i = 0; i < toDelete.length; i += DELETE_BATCH) {
        const batch = toDelete.slice(i, i + DELETE_BATCH);
        await s3.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: batch.map((uid) => ({ Key: `meta/${uid}.json` })),
                Quiet: true,
            },
        }));
    }
    for (const uid of toDelete) {
        console.log(`Pruned orphan meta shard meta/${uid}.json`);
    }
    return toDelete;
}

/** @internal test helper — list meta keys without loading bodies */
export async function listMetaObjectKeys(s3: S3Client, bucket: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: "meta/",
            ContinuationToken: continuationToken,
        }));
        for (const obj of response.Contents ?? []) {
            if (obj.Key?.endsWith(".json")) {
                keys.push(obj.Key);
            }
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return keys;
}
