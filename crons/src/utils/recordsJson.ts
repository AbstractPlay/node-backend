import { GetObjectCommand, PutObjectCommand, type PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { REC_BUCKET } from "../constants/recordsBucket.js";

/** Daily batch JSON — revalidate with S3 after each cron overwrite (no blanket invalidation). */
export const RECORDS_JSON_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** Manifest index — always revalidate before use. */
export const RECORDS_MANIFEST_CACHE_CONTROL = "no-cache";

export type PutRecordsJsonOptions = {
    cacheControl?: string;
};

export type GetRecordsJsonResult<T> = {
    data: T;
    bytes: number;
};

export function buildRecordsJsonPutInput(
    key: string,
    body: unknown,
    options?: PutRecordsJsonOptions,
): PutObjectCommandInput {
    return {
        Bucket: REC_BUCKET,
        Key: key,
        Body: JSON.stringify(body),
        ContentType: "application/json",
        CacheControl: options?.cacheControl ?? RECORDS_JSON_CACHE_CONTROL,
    };
}

export async function getRecordsJson<T>(
    s3: S3Client,
    key: string,
): Promise<GetRecordsJsonResult<T>> {
    const response = await s3.send(new GetObjectCommand({
        Bucket: REC_BUCKET,
        Key: key,
    }));
    const body = await response.Body?.transformToString();
    if (body === undefined) {
        throw new Error(`Unable to load s3://${REC_BUCKET}/${key}`);
    }
    return {
        data: JSON.parse(body) as T,
        bytes: Buffer.byteLength(body, "utf8"),
    };
}

export async function tryGetRecordsJson<T>(
    s3: S3Client,
    key: string,
): Promise<GetRecordsJsonResult<T> | undefined> {
    try {
        return await getRecordsJson<T>(s3, key);
    } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const name = error instanceof Error ? error.name : "";
        if (status === 404 || name === "NoSuchKey") {
            return undefined;
        }
        throw error;
    }
}

export async function putRecordsJson(
    s3: S3Client,
    key: string,
    body: unknown,
    options?: PutRecordsJsonOptions,
): Promise<number> {
    const json = JSON.stringify(body);
    const response = await s3.send(new PutObjectCommand({
        ...buildRecordsJsonPutInput(key, body, options),
        Body: json,
    }));
    const status = response.$metadata.httpStatusCode;
    if (status !== 200) {
        throw new Error(`PutObject failed for ${key}: HTTP ${status}`);
    }
    return Buffer.byteLength(json, "utf8");
}
