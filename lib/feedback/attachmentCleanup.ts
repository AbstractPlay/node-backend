import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import {
  deletePostAttachmentPrefix,
  deleteS3Objects,
  FEEDBACK_STAGING_PREFIX,
  getFeedbackAttachmentsBucket,
} from './attachments.js';
import type { FeedbackArchiveSnapshot } from './archive.js';
import { archiveS3Key } from './archive.js';
import { FEEDBACK_KINDS, FEEDBACK_STAGING_MAX_AGE_HOURS } from './constants.js';
import {
  HISTORY_LOOKUP_SK,
  historyPk,
  metaSk,
  postIdLookupPk,
  postPk,
} from './keys.js';

export type FeedbackAttachmentCleanupConfig = {
  now?: number;
  stagingMaxAgeHours?: number;
};

export type FeedbackAttachmentCleanupError = {
  id?: string;
  key?: string;
  message: string;
};

export type FeedbackAttachmentCleanupSummary = {
  archivedCandidates: number;
  archivedPurged: number;
  archivedSkipped: number;
  stagingDeleted: number;
  errors: FeedbackAttachmentCleanupError[];
};

export function defaultAttachmentCleanupConfig(): FeedbackAttachmentCleanupConfig {
  const stagingMaxAgeHours = Number.parseInt(
    process.env.FEEDBACK_STAGING_MAX_AGE_HOURS ?? String(FEEDBACK_STAGING_MAX_AGE_HOURS),
    10,
  );
  return {
    stagingMaxAgeHours: Number.isFinite(stagingMaxAgeHours)
      ? stagingMaxAgeHours
      : FEEDBACK_STAGING_MAX_AGE_HOURS,
  };
}

export function collectAttachmentKeysFromArchiveSnapshot(
  snapshot: FeedbackArchiveSnapshot,
): string[] {
  const meta = snapshot.meta;
  if (!meta || !Array.isArray(meta.attachmentKeys)) {
    return [];
  }
  return meta.attachmentKeys.filter((key): key is string => typeof key === 'string' && key.trim() !== '');
}

async function loadAttachmentKeysFromArchiveJson(
  s3: S3Client,
  s3ArchiveKey: string,
): Promise<string[]> {
  const bucket = getFeedbackAttachmentsBucket();
  const result = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: s3ArchiveKey,
  }));
  const body = await result.Body?.transformToString();
  if (!body) {
    return [];
  }
  const snapshot = JSON.parse(body) as FeedbackArchiveSnapshot;
  return collectAttachmentKeysFromArchiveSnapshot(snapshot);
}

async function markAttachmentsPurged(
  client: DynamoDBDocumentClient,
  tableName: string,
  historyRow: Record<string, unknown>,
  postId: string,
  purgedAt: number,
): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: historyRow.pk as string, sk: historyRow.sk as string },
    UpdateExpression: 'SET attachmentsPurgedAt = :purgedAt',
    ExpressionAttributeValues: { ':purgedAt': purgedAt },
  }));
  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: postIdLookupPk(postId), sk: HISTORY_LOOKUP_SK },
    UpdateExpression: 'SET attachmentsPurgedAt = :purgedAt',
    ExpressionAttributeValues: { ':purgedAt': purgedAt },
  }));
}

async function shouldSkipArchivedPurge(
  client: DynamoDBDocumentClient,
  tableName: string,
  postId: string,
  now: number,
  historyRow: Record<string, unknown>,
): Promise<boolean> {
  if (historyRow.attachmentsPurgedAt !== undefined) {
    return true;
  }
  const purgeAfter = Number(historyRow.attachmentsPurgeAfter);
  if (Number.isFinite(purgeAfter) && purgeAfter > now) {
    return true;
  }

  const metaResult = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: postPk(postId), sk: metaSk() },
  }));
  if (metaResult.Item) {
    const expiresAt = Number(metaResult.Item.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt > now) {
      return true;
    }
  }
  return false;
}

async function purgeArchivedPostAttachments(
  client: DynamoDBDocumentClient,
  s3: S3Client,
  tableName: string,
  historyRow: Record<string, unknown>,
  now: number,
): Promise<{ purged: boolean; skipped: boolean; errors: FeedbackAttachmentCleanupError[] }> {
  const postId = String(historyRow.id);
  const skipped = await shouldSkipArchivedPurge(client, tableName, postId, now, historyRow);
  if (skipped) {
    return { purged: false, skipped: true, errors: [] };
  }

  let keys: string[] = Array.isArray(historyRow.attachmentKeys)
    ? historyRow.attachmentKeys.filter((key): key is string => typeof key === 'string')
    : [];
  if (keys.length === 0) {
    const s3ArchiveKey = typeof historyRow.s3ArchiveKey === 'string'
      ? historyRow.s3ArchiveKey
      : archiveS3Key(postId);
    try {
      keys = await loadAttachmentKeysFromArchiveJson(s3, s3ArchiveKey);
    } catch (error) {
      return {
        purged: false,
        skipped: false,
        errors: [{
          id: postId,
          message: error instanceof Error ? error.message : 'failed to read archive snapshot',
        }],
      };
    }
  }

  const explicit = await deleteS3Objects(s3, keys);
  const prefix = await deletePostAttachmentPrefix(s3, postId);
  const errors: FeedbackAttachmentCleanupError[] = [
    ...explicit.errors.map((message) => ({ id: postId, message })),
    ...prefix.errors.map((message) => ({ id: postId, message })),
  ];
  if (errors.length > 0) {
    return { purged: false, skipped: false, errors };
  }

  await markAttachmentsPurged(client, tableName, historyRow, postId, now);
  return { purged: true, skipped: false, errors: [] };
}

export async function purgeStaleStagingObjects(
  s3: S3Client,
  config: FeedbackAttachmentCleanupConfig = defaultAttachmentCleanupConfig(),
): Promise<{ deleted: number; errors: FeedbackAttachmentCleanupError[] }> {
  const now = config.now ?? Date.now();
  const maxAgeMs = (config.stagingMaxAgeHours ?? FEEDBACK_STAGING_MAX_AGE_HOURS) * 3_600_000;
  const cutoff = now - maxAgeMs;
  const bucket = getFeedbackAttachmentsBucket();
  const keysToDelete: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: FEEDBACK_STAGING_PREFIX,
      ContinuationToken: continuationToken,
    }));
    for (const item of result.Contents ?? []) {
      if (!item.Key || !item.LastModified) {
        continue;
      }
      if (item.LastModified.getTime() < cutoff) {
        keysToDelete.push(item.Key);
      }
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  const deleteResult = await deleteS3Objects(s3, keysToDelete);
  return {
    deleted: deleteResult.deleted,
    errors: deleteResult.errors.map((message) => ({ key: 'staging', message })),
  };
}

export async function runFeedbackAttachmentCleanupJob(
  client: DynamoDBDocumentClient,
  s3: S3Client,
  tableName: string,
  config: FeedbackAttachmentCleanupConfig = defaultAttachmentCleanupConfig(),
): Promise<FeedbackAttachmentCleanupSummary> {
  const now = config.now ?? Date.now();
  const summary: FeedbackAttachmentCleanupSummary = {
    archivedCandidates: 0,
    archivedPurged: 0,
    archivedSkipped: 0,
    stagingDeleted: 0,
    errors: [],
  };

  for (const kind of FEEDBACK_KINDS) {
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await client.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': historyPk(kind) },
        ExclusiveStartKey: lastKey,
      }));
      for (const item of result.Items ?? []) {
        summary.archivedCandidates += 1;
        const outcome = await purgeArchivedPostAttachments(
          client,
          s3,
          tableName,
          item,
          now,
        );
        if (outcome.skipped) {
          summary.archivedSkipped += 1;
        } else if (outcome.purged) {
          summary.archivedPurged += 1;
        }
        summary.errors.push(...outcome.errors);
      }
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
  }

  const staging = await purgeStaleStagingObjects(s3, { ...config, now });
  summary.stagingDeleted = staging.deleted;
  summary.errors.push(...staging.errors);

  return summary;
}
