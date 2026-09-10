import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FEEDBACK_ATTACHMENT_PRESIGN_TTL_SECONDS } from './constants.js';

const STAGING_PREFIX = 'staging/';

export function stagingKeyPrefix(userId: string): string {
  return `${STAGING_PREFIX}${userId}/`;
}

export function assertStagingKeysOwned(
  userId: string,
  keys: string[],
): { ok: true } | { ok: false; message: string } {
  const prefix = stagingKeyPrefix(userId);
  for (const key of keys) {
    if (!key.startsWith(prefix) || key.length <= prefix.length) {
      return { ok: false, message: 'attachment key must belong to your staging upload prefix.' };
    }
    if (key.includes('..')) {
      return { ok: false, message: 'invalid attachment key.' };
    }
  }
  return { ok: true };
}

export function getFeedbackAttachmentsBucket(): string {
  const bucket = process.env.FEEDBACK_ATTACHMENTS_BUCKET;
  if (!bucket) {
    throw new Error('FEEDBACK_ATTACHMENTS_BUCKET is not configured');
  }
  return bucket;
}

export async function presignAttachmentGetUrls(
  s3: S3Client,
  keys: string[],
): Promise<{ key: string; url: string }[]> {
  if (keys.length === 0) {
    return [];
  }
  const bucket = getFeedbackAttachmentsBucket();
  const results: { key: string; url: string }[] = [];
  for (const key of keys) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn: FEEDBACK_ATTACHMENT_PRESIGN_TTL_SECONDS });
    results.push({ key, url });
  }
  return results;
}
