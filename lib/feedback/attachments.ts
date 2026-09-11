import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import {
  FEEDBACK_ALLOWED_ATTACHMENT_TYPES,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_ATTACHMENT_PRESIGN_TTL_SECONDS,
} from './constants.js';

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

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/png') {
    return 'png';
  }
  if (contentType === 'image/jpeg') {
    return 'jpg';
  }
  if (contentType === 'image/webp') {
    return 'webp';
  }
  return 'bin';
}

export async function presignAttachmentPutUrl(
  s3: S3Client,
  userId: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; headers: Record<string, string> }> {
  const bucket = getFeedbackAttachmentsBucket();
  const ext = extensionForContentType(contentType);
  const key = `${stagingKeyPrefix(userId)}${uuidv4()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: FEEDBACK_ATTACHMENT_PRESIGN_TTL_SECONDS,
  });
  return {
    uploadUrl,
    key,
    headers: { 'Content-Type': contentType },
  };
}

export async function assertStagingObjectsExist(
  s3: S3Client,
  keys: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const bucket = getFeedbackAttachmentsBucket();
  for (const key of keys) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      return { ok: false, message: `attachment not found: ${key}` };
    }
  }
  return { ok: true };
}

export async function finalizeAttachmentKeys(
  s3: S3Client,
  userId: string,
  postId: string,
  stagingKeys: string[],
): Promise<string[]> {
  const bucket = getFeedbackAttachmentsBucket();
  const prefix = stagingKeyPrefix(userId);
  const finalKeys: string[] = [];
  for (const stagingKey of stagingKeys) {
    const fileName = stagingKey.slice(prefix.length);
    const finalKey = `${postId}/${fileName}`;
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${stagingKey}`,
      Key: finalKey,
    }));
    finalKeys.push(finalKey);
  }
  return finalKeys;
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
