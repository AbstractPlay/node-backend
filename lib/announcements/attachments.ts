import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { importAttachmentPrefix } from './keys.js';

const PRESIGN_TTL_SECONDS = 3600;

const EXT_TO_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function getAnnouncementsAttachmentsBucket(): string {
  const bucket = process.env.ANNOUNCEMENTS_ATTACHMENTS_BUCKET;
  if (!bucket) {
    throw new Error('ANNOUNCEMENTS_ATTACHMENTS_BUCKET is not configured');
  }
  return bucket;
}

export function contentTypeForFilePath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_TYPE[ext] ?? 'application/octet-stream';
}

export async function putAnnouncementImportFile(
  s3: S3Client,
  announcementId: string,
  localPath: string,
  fileName: string,
): Promise<string> {
  const bucket = getAnnouncementsAttachmentsBucket();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${importAttachmentPrefix(announcementId)}${safeName}`;
  const body = readFileSync(localPath);
  const contentType = contentTypeForFilePath(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return key;
}

export async function presignAnnouncementAttachmentUrls(
  s3: S3Client,
  keys: string[],
): Promise<{ key: string; url: string }[]> {
  if (keys.length === 0) {
    return [];
  }
  const bucket = getAnnouncementsAttachmentsBucket();
  const results: { key: string; url: string }[] = [];
  for (const key of keys) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_TTL_SECONDS });
    results.push({ key, url });
  }
  return results;
}
