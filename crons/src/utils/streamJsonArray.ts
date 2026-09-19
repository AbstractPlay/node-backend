import { createRequire } from "node:module";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Readable, Transform } from "node:stream";

const require = createRequire(import.meta.url);

/** createRequire — stream-json is CJS; ESM named imports fail on Lambda. */
const { parser } = require("stream-json") as { parser: () => Transform };
const { streamArray } = require("stream-json/streamers/StreamArray") as {
    streamArray: () => Transform;
};

/**
 * Stream-parse a top-level JSON array without holding the full file string in memory.
 */
export async function streamJsonArrayFromReadable<T>(
    readable: Readable,
    onItem: (item: T) => void,
): Promise<number> {
    const jsonParser = parser();
    const arrayStreamer = streamArray();
    readable.pipe(jsonParser).pipe(arrayStreamer);

    let count = 0;
    for await (const chunk of arrayStreamer) {
        const row = chunk as unknown as { value: T };
        onItem(row.value);
        count++;
    }
    return count;
}

export async function streamJsonArrayFromS3<T>(
    s3: S3Client,
    bucket: string,
    key: string,
    onItem: (item: T) => void,
): Promise<number> {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = response.Body;
    if (body === undefined) {
        throw new Error(`Unable to load s3://${bucket}/${key}`);
    }
    return streamJsonArrayFromReadable(body as Readable, onItem);
}
