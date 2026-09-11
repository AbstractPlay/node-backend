import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import {
  FEEDBACK_ATTACHMENT_PRESIGN_TTL_SECONDS,
} from './constants.js';

export const FEEDBACK_STAGING_PREFIX = 'staging/';

export function stagingKeyPrefix(userId: string): string {
  return `${FEEDBACK_STAGING_PREFIX}${userId}/`;
}

export function postAttachmentPrefix(postId: string): string {
  return `${postId}/`;
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

export type DeleteS3ObjectsResult = {
  deleted: number;
  errors: string[];
};

export async function deleteS3Objects(
  s3: S3Client,
  keys: string[],
): Promise<DeleteS3ObjectsResult> {
  const bucket = getFeedbackAttachmentsBucket();
  const uniqueKeys = [...new Set(keys.filter((key) => typeof key === 'string' && key.trim() !== ''))];
  let deleted = 0;
  const errors: string[] = [];
  for (const key of uniqueKeys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      deleted += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `delete failed: ${key}`);
    }
  }
  return { deleted, errors };
}

export async function deleteStagingKeys(
  s3: S3Client,
  keys: string[],
): Promise<DeleteS3ObjectsResult> {
  return deleteS3Objects(s3, keys);
}

export async function listObjectKeysUnderPrefix(
  s3: S3Client,
  prefix: string,
): Promise<string[]> {
  const bucket = getFeedbackAttachmentsBucket();
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const item of result.Contents ?? []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export async function deletePostAttachmentPrefix(
  s3: S3Client,
  postId: string,
): Promise<DeleteS3ObjectsResult> {
  const keys = await listObjectKeysUnderPrefix(s3, postAttachmentPrefix(postId));
  return deleteS3Objects(s3, keys);
}

export async function deletePostAttachments(
  s3: S3Client,
  postId: string,
  attachmentKeys: string[] | undefined,
): Promise<DeleteS3ObjectsResult> {
  const explicit = await deleteS3Objects(s3, attachmentKeys ?? []);
  const prefix = await deletePostAttachmentPrefix(s3, postId);
  return {
    deleted: explicit.deleted + prefix.deleted,
    errors: [...explicit.errors, ...prefix.errors],
  };
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
    await s3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: stagingKey,
    }));
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
