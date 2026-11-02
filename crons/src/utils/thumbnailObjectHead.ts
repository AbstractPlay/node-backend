import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { ObjectHead } from "./thumbnailFreshness.js";

/** True when S3 indicates the object key does not exist (not a permissions failure). */
export function isS3MissingObjectError(err: unknown): boolean {
    if (err === null || typeof err !== "object") {
        return false;
    }
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.name === "NoSuchKey") {
        return true;
    }
    return e.$metadata?.httpStatusCode === 404;
}

/**
 * Read Last-Modified via a zero-byte ranged GET (same IAM as sqs-to-render reads).
 * Avoids HeadObject, which can 403 under the crons role on Node 24 runtime SDK.
 */
export async function fetchThumbnailObjectHead(
    s3: S3Client,
    bucket: string,
    key: string,
): Promise<ObjectHead | null> {
    try {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: key,
                Range: "bytes=0-0",
            }),
        );
        if (response.Body) {
            await response.Body.transformToByteArray();
        }
        if (!response.LastModified) {
            return null;
        }
        return { key, lastModified: response.LastModified };
    } catch (err) {
        if (isS3MissingObjectError(err)) {
            return null;
        }
        throw err;
    }
}
