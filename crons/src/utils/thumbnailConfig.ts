import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

/** Public thumbnail CDN bucket (JSON + SVG). */
export const THUMB_BUCKET = "thumbnails.abstractplay.com";

/** Metas skipped for prerender/SVG (JSON-only or known broken). */
export const THUMBNAIL_BROKEN_METAS: readonly string[] = [];

const THUMBNAIL_S3_REGION = "us-east-1";

/**
 * Lambda Node 24 runtime SDK defaults can enable S3 integrity checks that 403 on Head/Get
 * against legacy CDN objects; use WHEN_REQUIRED for the thumbnail pipeline.
 */
export const THUMBNAIL_S3_CLIENT_CONFIG = {
    region: THUMBNAIL_S3_REGION,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
} as const satisfies S3ClientConfig;

export function createThumbnailS3Client(): S3Client {
    return new S3Client(THUMBNAIL_S3_CLIENT_CONFIG);
}
