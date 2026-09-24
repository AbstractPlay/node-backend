import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REC_BUCKET = "records.abstractplay.com";
const REGION = "us-east-1";
const CACHE_CONTROL = "public, max-age=86400";

const dryRun = process.argv.includes("--dry-run");

const robotsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../static/records-robots.txt",
);
const body = readFileSync(robotsPath, "utf8");

if (dryRun) {
    console.log(`[dry-run] Would upload robots.txt to s3://${REC_BUCKET}/robots.txt`);
    console.log(body);
    process.exit(0);
}

const s3 = new S3Client({ region: REGION });
await s3.send(
    new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: "robots.txt",
        Body: body,
        ContentType: "text/plain; charset=utf-8",
        CacheControl: CACHE_CONTROL,
    }),
);

console.log(`Uploaded robots.txt to s3://${REC_BUCKET}/robots.txt`);
