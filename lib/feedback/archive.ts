import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  FEEDBACK_ARCHIVE_AFTER_TERMINAL_DAYS,
  FEEDBACK_ARCHIVE_S3_PREFIX,
  FEEDBACK_KINDS,
  FEEDBACK_LIVE_RETENTION_AFTER_ARCHIVE_DAYS,
  TERMINAL_STATUSES,
} from './constants.js';
import { getFeedbackAttachmentsBucket } from './attachments.js';
import {
  historyPk,
  historySk,
  metaSk,
  postIdLookupPk,
  postPk,
  HISTORY_LOOKUP_SK,
  statusGsi2Pk,
  USER_PK_PREFIX,
  userPostsSkPrefix,
} from './keys.js';
import type { FeedbackHistoryItem, FeedbackHistorySummary, FeedbackKind, FeedbackMetaItem } from './types.js';

export type FeedbackArchiveConfig = {
  archiveAfterTerminalDays: number;
  liveRetentionAfterArchiveDays: number;
  now?: number;
};

export type ArchivePostResult =
  | { ok: true; historyKey: string; s3ArchiveKey: string; alreadyArchived?: boolean }
  | { ok: false; message: string };

export type FeedbackArchiveSnapshot = {
  archivedAt: number;
  postId: string;
  meta: Record<string, unknown>;
  children: Record<string, unknown>[];
  userIndexRows: Record<string, unknown>[];
};

export function defaultArchiveConfig(): FeedbackArchiveConfig {
  const archiveAfterTerminalDays = Number.parseInt(
    process.env.FEEDBACK_ARCHIVE_AFTER_TERMINAL_DAYS ?? String(FEEDBACK_ARCHIVE_AFTER_TERMINAL_DAYS),
    10,
  );
  const liveRetentionAfterArchiveDays = Number.parseInt(
    process.env.FEEDBACK_LIVE_RETENTION_AFTER_ARCHIVE_DAYS
      ?? String(FEEDBACK_LIVE_RETENTION_AFTER_ARCHIVE_DAYS),
    10,
  );
  return {
    archiveAfterTerminalDays: Number.isFinite(archiveAfterTerminalDays)
      ? archiveAfterTerminalDays
      : FEEDBACK_ARCHIVE_AFTER_TERMINAL_DAYS,
    liveRetentionAfterArchiveDays: Number.isFinite(liveRetentionAfterArchiveDays)
      ? liveRetentionAfterArchiveDays
      : FEEDBACK_LIVE_RETENTION_AFTER_ARCHIVE_DAYS,
  };
}

export function archiveS3Key(postId: string): string {
  return `${FEEDBACK_ARCHIVE_S3_PREFIX}/${postId}.json`;
}

export function buildHistorySummaryFromMeta(meta: FeedbackMetaItem): FeedbackHistorySummary {
  const closedAt = meta.terminalAt ?? meta.updatedAt;
  return {
    id: meta.id,
    kind: meta.kind,
    title: meta.title,
    terminalStatus: meta.status,
    closedAt,
    authorName: meta.authorName,
    effectiveVotes: meta.effectiveVotes,
    gameUrl: meta.gameUrl,
    implementedGameMeta: meta.implementedGameMeta,
    resolutionNote: meta.resolutionNote,
  };
}

export function toPublicHistorySummary(item: Record<string, unknown>): FeedbackHistorySummary {
  return {
    id: String(item.id),
    kind: item.kind as FeedbackKind,
    title: String(item.title),
    terminalStatus: String(item.terminalStatus),
    closedAt: Number(item.closedAt),
    authorName: String(item.authorName),
    effectiveVotes: Number(item.effectiveVotes ?? 0),
    gameUrl: typeof item.gameUrl === 'string' ? item.gameUrl : undefined,
    implementedGameMeta: item.implementedGameMeta as FeedbackHistorySummary['implementedGameMeta'],
    resolutionNote: typeof item.resolutionNote === 'string' ? item.resolutionNote : undefined,
    s3ArchiveKey: typeof item.s3ArchiveKey === 'string' ? item.s3ArchiveKey : undefined,
  };
}

async function loadPostRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  postId: string,
): Promise<Record<string, unknown>[]> {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': postPk(postId) },
  }));
  return (result.Items ?? []) as Record<string, unknown>[];
}

async function loadUserIndexRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  authorId: string,
  postId: string,
): Promise<Record<string, unknown>[]> {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `${USER_PK_PREFIX}${authorId}`,
      ':prefix': userPostsSkPrefix(),
    },
  }));
  return (result.Items ?? []).filter((item) => String(item.id) === postId) as Record<string, unknown>[];
}

async function putSnapshotIfAbsent(
  s3: S3Client,
  s3Key: string,
  snapshot: FeedbackArchiveSnapshot,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const bucket = getFeedbackAttachmentsBucket();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
    return { ok: true };
  } catch {
    // object missing — write below
  }
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: JSON.stringify(snapshot),
      ContentType: 'application/json',
    }));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'S3 put failed',
    };
  }
}

export async function archivePost(
  client: DynamoDBDocumentClient,
  s3: S3Client,
  tableName: string,
  postId: string,
  config: FeedbackArchiveConfig = defaultArchiveConfig(),
): Promise<ArchivePostResult> {
  const now = config.now ?? Date.now();
  const metaResult = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: postPk(postId), sk: metaSk() },
  }));
  const meta = metaResult.Item as FeedbackMetaItem | undefined;
  if (!meta) {
    return { ok: false, message: 'post not found.' };
  }
  if (meta.archivedAt) {
    return {
      ok: true,
      alreadyArchived: true,
      historyKey: `${historyPk(meta.kind)}:${historySk(meta.archivedAt, postId)}`,
      s3ArchiveKey: meta.s3ArchiveKey ?? archiveS3Key(postId),
    };
  }
  if (meta.terminalAt === undefined) {
    return { ok: false, message: 'post is not terminal.' };
  }
  if (meta.retentionHold) {
    return { ok: false, message: 'post has retention hold.' };
  }

  const children = await loadPostRows(client, tableName, postId);
  const userIndexRows = await loadUserIndexRows(client, tableName, meta.authorId, postId);
  const s3ArchiveKey = archiveS3Key(postId);
  const snapshot: FeedbackArchiveSnapshot = {
    archivedAt: now,
    postId,
    meta: meta as unknown as Record<string, unknown>,
    children,
    userIndexRows,
  };

  const s3Result = await putSnapshotIfAbsent(s3, s3ArchiveKey, snapshot);
  if (!s3Result.ok) {
    return { ok: false, message: s3Result.message };
  }

  const summary = buildHistorySummaryFromMeta(meta);
  const closedAt = summary.closedAt;
  const historyRow: FeedbackHistoryItem = {
    ...summary,
    s3ArchiveKey,
    pk: historyPk(meta.kind),
    sk: historySk(closedAt, postId),
    entityType: 'history',
  };
  const lookupRow = {
    pk: postIdLookupPk(postId),
    sk: HISTORY_LOOKUP_SK,
    entityType: 'historyLookup',
    ...summary,
    s3ArchiveKey,
  };

  const existingHistory = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: historyRow.pk, sk: historyRow.sk },
  }));
  if (!existingHistory.Item) {
    await client.send(new PutCommand({ TableName: tableName, Item: historyRow }));
    await client.send(new PutCommand({ TableName: tableName, Item: lookupRow }));
  }

  const expiresAt = now + config.liveRetentionAfterArchiveDays * 86_400_000;
  const rowsToExpire = [...children, ...userIndexRows];
  for (const row of rowsToExpire) {
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: row.pk as string, sk: row.sk as string },
      UpdateExpression: 'SET expiresAt = :expiresAt',
      ExpressionAttributeValues: { ':expiresAt': expiresAt },
    }));
  }

  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: postPk(postId), sk: metaSk() },
    UpdateExpression: 'SET archivedAt = :archivedAt, s3ArchiveKey = :s3ArchiveKey, expiresAt = :expiresAt',
    ExpressionAttributeValues: {
      ':archivedAt': now,
      ':s3ArchiveKey': s3ArchiveKey,
      ':expiresAt': expiresAt,
    },
  }));

  return {
    ok: true,
    historyKey: `${historyRow.pk}:${historyRow.sk}`,
    s3ArchiveKey,
  };
}

export async function findPostsReadyForArchive(
  client: DynamoDBDocumentClient,
  tableName: string,
  config: FeedbackArchiveConfig = defaultArchiveConfig(),
): Promise<string[]> {
  const now = config.now ?? Date.now();
  const archiveDelayMs = config.archiveAfterTerminalDays * 86_400_000;
  const ids = new Set<string>();

  for (const kind of FEEDBACK_KINDS) {
    for (const status of TERMINAL_STATUSES[kind]) {
      let lastKey: Record<string, unknown> | undefined;
      do {
        const result = await client.send(new QueryCommand({
          TableName: tableName,
          IndexName: 'ByStatus',
          KeyConditionExpression: 'gsi2pk = :pk',
          ExpressionAttributeValues: { ':pk': statusGsi2Pk(kind, status) },
          ExclusiveStartKey: lastKey,
        }));
        for (const item of result.Items ?? []) {
          if (item.sk !== metaSk()) {
            continue;
          }
          if (item.archivedAt !== undefined) {
            continue;
          }
          if (item.retentionHold === true) {
            continue;
          }
          const terminalAt = Number(item.terminalAt);
          if (!Number.isFinite(terminalAt) || terminalAt + archiveDelayMs > now) {
            continue;
          }
          ids.add(String(item.id));
        }
        lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastKey);
    }
  }

  return [...ids];
}

export type FeedbackArchiveRunSummary = {
  candidates: number;
  archived: number;
  skipped: number;
  errors: { id: string; message: string }[];
};

export async function runFeedbackArchiveJob(
  client: DynamoDBDocumentClient,
  s3: S3Client,
  tableName: string,
  config: FeedbackArchiveConfig = defaultArchiveConfig(),
): Promise<FeedbackArchiveRunSummary> {
  const postIds = await findPostsReadyForArchive(client, tableName, config);
  const summary: FeedbackArchiveRunSummary = {
    candidates: postIds.length,
    archived: 0,
    skipped: 0,
    errors: [],
  };

  for (const postId of postIds) {
    const result = await archivePost(client, s3, tableName, postId, config);
    if (!result.ok) {
      summary.errors.push({ id: postId, message: result.message });
      continue;
    }
    if (result.alreadyArchived) {
      summary.skipped += 1;
    } else {
      summary.archived += 1;
    }
  }

  return summary;
}
