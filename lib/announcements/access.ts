import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  ANNOUNCEMENT_PK,
  ANNOUNCEMENT_PUBLISHED_PK,
  announcementSk,
  publishedIndexSk,
} from './keys.js';
import { presignAnnouncementAttachmentUrls } from './attachments.js';
import type {
  AnnouncementGetPars,
  AnnouncementPublicItem,
  AnnouncementRecord,
  AnnouncementsListPars,
} from './types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type AnnouncementsResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; statusCode?: number; code?: string };

function encodeCursor(lastSk: string): string {
  return Buffer.from(JSON.stringify({ sk: lastSk }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { sk: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { sk?: string };
    if (typeof parsed.sk === 'string' && parsed.sk.length > 0) {
      return { sk: parsed.sk };
    }
    return null;
  } catch {
    return null;
  }
}

function toPublicItem(row: Record<string, unknown>): AnnouncementPublicItem {
  return {
    id: String(row.id),
    title: String(row.title ?? 'Announcement'),
    body: String(row.body ?? ''),
    publishedAt: Number(row.publishedAt),
    attachmentKeys: Array.isArray(row.attachmentKeys)
      ? row.attachmentKeys.map(String)
      : undefined,
    reactionCounts: typeof row.reactionCounts === 'object' && row.reactionCounts !== null
      ? row.reactionCounts as Record<string, number>
      : undefined,
  };
}

export async function announcementsList(
  client: DynamoDBDocumentClient,
  tableName: string,
  pars: AnnouncementsListPars,
): Promise<AnnouncementsResult<{ items: AnnouncementPublicItem[]; nextCursor?: string }>> {
  const limit = Math.min(Math.max(pars.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const decoded = pars.cursor ? decodeCursor(pars.cursor) : null;
  if (pars.cursor && !decoded) {
    return { ok: false, message: 'Invalid cursor.', statusCode: 400 };
  }

  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': ANNOUNCEMENT_PUBLISHED_PK },
    ExclusiveStartKey: decoded ? { pk: ANNOUNCEMENT_PUBLISHED_PK, sk: decoded.sk } : undefined,
    Limit: limit,
    ScanIndexForward: false,
  }));

  const items = (result.Items ?? []).map((row) => toPublicItem(row));
  let nextCursor: string | undefined;
  if (result.LastEvaluatedKey?.sk) {
    nextCursor = encodeCursor(String(result.LastEvaluatedKey.sk));
  }
  return { ok: true, data: { items, nextCursor } };
}

export async function announcementGet(
  client: DynamoDBDocumentClient,
  tableName: string,
  s3: S3Client | null,
  pars: AnnouncementGetPars,
): Promise<AnnouncementsResult<AnnouncementPublicItem & { attachmentUrls?: { key: string; url: string }[] }>> {
  const id = pars.id?.trim();
  if (!id) {
    return { ok: false, message: 'id is required.', statusCode: 400 };
  }

  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ANNOUNCEMENT_PK, sk: announcementSk(id) },
  }));
  const row = result.Item;
  if (!row || row.status !== 'published') {
    return { ok: false, message: 'Announcement not found.', statusCode: 404 };
  }

  const item = toPublicItem(row);
  const keys = item.attachmentKeys ?? [];
  if (keys.length > 0 && s3) {
    const attachmentUrls = await presignAnnouncementAttachmentUrls(s3, keys);
    return { ok: true, data: { ...item, attachmentUrls } };
  }
  return { ok: true, data: item };
}

export type AnnouncementWriteInput = {
  id: string;
  status: AnnouncementRecord['status'];
  title: string;
  body: string;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
  source: AnnouncementRecord['source'];
  attachmentKeys?: string[];
  reactionCounts?: Record<string, number>;
};

export function buildAnnouncementPutItems(record: AnnouncementWriteInput): {
  canonical: AnnouncementRecord;
  publishedIndex: Record<string, unknown>;
} {
  const now = Date.now();
  const canonical: AnnouncementRecord = {
    pk: ANNOUNCEMENT_PK,
    sk: announcementSk(record.id),
    id: record.id,
    status: record.status,
    title: record.title,
    body: record.body,
    publishedAt: record.publishedAt,
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
    source: record.source,
    attachmentKeys: record.attachmentKeys,
    reactionCounts: record.reactionCounts ?? {},
  };

  const publishedIndex: Record<string, unknown> = {
    pk: ANNOUNCEMENT_PUBLISHED_PK,
    sk: publishedIndexSk(record.publishedAt, record.id),
    id: record.id,
    status: record.status,
    title: record.title,
    body: record.body,
    publishedAt: record.publishedAt,
    attachmentKeys: record.attachmentKeys,
    reactionCounts: record.reactionCounts ?? {},
    source: record.source,
  };

  return { canonical, publishedIndex };
}

export async function putAnnouncementRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  record: AnnouncementWriteInput,
): Promise<void> {
  const { canonical, publishedIndex } = buildAnnouncementPutItems(record);
  await client.send(new PutCommand({
    TableName: tableName,
    Item: canonical,
  }));
  if (record.status === 'published') {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: publishedIndex,
    }));
  }
}
