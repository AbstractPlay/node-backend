import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { postAnnouncementDiscordMirror } from './discord.js';
import { syncAnnouncementsRss } from './rssSync.js';
import { announcementsSiteUrl } from './siteUrl.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ANNOUNCEMENT_PK,
  announcementSk,
} from './keys.js';
import {
  announcementGet,
  buildAnnouncementPutItems,
  putAnnouncementRecord,
  type AnnouncementsResult,
} from './access.js';
import {
  getAnnouncementsAttachmentsBucket,
  presignAnnouncementAttachmentUrls,
} from './attachments.js';
import type {
  AnnouncementRecord,
  AnnouncementStatus,
} from './types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 100_000;
const MAX_ADMIN_NOTE_LEN = 2000;
const MAX_ATTACHMENTS = 10;
const PRESIGN_PUT_TTL = 900;
const MAX_UPLOAD_BYTES = 5_242_880;

const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const EXT_FOR_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

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

export function authorAttachmentPrefix(announcementId: string): string {
  return `announcements/${announcementId}/`;
}

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = extname(base).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return base;
  }
  return `${base.replace(/\.[^.]+$/, '')}.png`;
}

function validateAttachmentKeysForAnnouncement(
  announcementId: string,
  keys: string[] | undefined,
): AnnouncementsResult<string[]> {
  if (!keys || keys.length === 0) {
    return { ok: true, data: [] };
  }
  if (keys.length > MAX_ATTACHMENTS) {
    return { ok: false, message: `At most ${MAX_ATTACHMENTS} attachments allowed.`, statusCode: 400 };
  }
  const prefix = authorAttachmentPrefix(announcementId);
  const importPrefix = `import/${announcementId}/`;
  for (const key of keys) {
    if (!key.startsWith(prefix) && !key.startsWith(importPrefix)) {
      return {
        ok: false,
        message: 'Invalid attachment key for this announcement.',
        statusCode: 400,
      };
    }
  }
  return { ok: true, data: keys };
}

async function loadCanonical(
  client: DynamoDBDocumentClient,
  tableName: string,
  id: string,
): Promise<AnnouncementRecord | null> {
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ANNOUNCEMENT_PK, sk: announcementSk(id) },
  }));
  if (!result.Item) {
    return null;
  }
  return result.Item as AnnouncementRecord;
}

export type AnnouncementsAdminListPars = {
  status?: AnnouncementStatus;
  limit?: number;
  cursor?: string;
};

export type AnnouncementAdminListItem = {
  id: string;
  status: AnnouncementStatus;
  title: string;
  publishedAt: number;
  updatedAt: number;
  createdAt: number;
};

export async function announcementsAdminList(
  client: DynamoDBDocumentClient,
  tableName: string,
  pars: AnnouncementsAdminListPars,
): Promise<AnnouncementsResult<{ items: AnnouncementAdminListItem[]; nextCursor?: string }>> {
  const limit = Math.min(Math.max(pars.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const decoded = pars.cursor ? decodeCursor(pars.cursor) : null;
  if (pars.cursor && !decoded) {
    return { ok: false, message: 'Invalid cursor.', statusCode: 400 };
  }

  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': ANNOUNCEMENT_PK },
    ExclusiveStartKey: decoded ? { pk: ANNOUNCEMENT_PK, sk: decoded.sk } : undefined,
    Limit: limit,
    ScanIndexForward: false,
  }));

  let items = (result.Items ?? [])
    .filter((row) => row.status && !String(row.sk).startsWith('REACTION#'))
    .map((row) => ({
      id: String(row.id),
      status: row.status as AnnouncementStatus,
      title: String(row.title ?? ''),
      publishedAt: Number(row.publishedAt ?? 0),
      updatedAt: Number(row.updatedAt ?? 0),
      createdAt: Number(row.createdAt ?? 0),
    }));

  if (pars.status) {
    items = items.filter((item) => item.status === pars.status);
  }

  let nextCursor: string | undefined;
  if (result.LastEvaluatedKey?.sk) {
    nextCursor = encodeCursor(String(result.LastEvaluatedKey.sk));
  }
  return { ok: true, data: { items, nextCursor } };
}

export type AnnouncementSavePars = {
  id?: string;
  title: string;
  body: string;
  attachmentKeys?: string[];
  adminNote?: string;
};

export async function announcementSave(
  client: DynamoDBDocumentClient,
  tableName: string,
  pars: AnnouncementSavePars,
): Promise<AnnouncementsResult<{ id: string; status: AnnouncementStatus; updatedAt: number }>> {
  const title = pars.title?.trim() ?? '';
  const body = pars.body ?? '';
  if (!title) {
    return { ok: false, message: 'title is required.', statusCode: 400 };
  }
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false, message: 'title is too long.', statusCode: 400 };
  }
  if (!body.trim()) {
    return { ok: false, message: 'body is required.', statusCode: 400 };
  }
  if (body.length > MAX_BODY_LEN) {
    return { ok: false, message: 'body is too long.', statusCode: 400 };
  }
  const adminNote = pars.adminNote?.trim();
  if (adminNote && adminNote.length > MAX_ADMIN_NOTE_LEN) {
    return { ok: false, message: 'admin note is too long.', statusCode: 400 };
  }

  const now = Date.now();
  const id = pars.id?.trim() || randomUUID();
  const existing = await loadCanonical(client, tableName, id);

  const keysValidated = validateAttachmentKeysForAnnouncement(id, pars.attachmentKeys);
  if (!keysValidated.ok) {
    return keysValidated;
  }
  const attachmentKeys = keysValidated.data;

  const status: AnnouncementStatus = existing?.status ?? 'draft';
  if (status === 'retracted') {
    return { ok: false, message: 'Cannot edit a retracted announcement.', statusCode: 400 };
  }

  const publishedAt = existing?.publishedAt ?? 0;
  const createdAt = existing?.createdAt ?? now;
  let editedAt = existing?.editedAt;
  if (existing?.status === 'published') {
    const changed = existing.title !== title || existing.body !== body;
    if (changed) {
      editedAt = now;
    }
  }

  const record: AnnouncementRecord = {
    pk: ANNOUNCEMENT_PK,
    sk: announcementSk(id),
    id,
    status,
    title,
    body,
    publishedAt,
    createdAt,
    updatedAt: now,
    source: existing?.source ?? 'ap',
    attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
    reactionCounts: existing?.reactionCounts ?? {},
    discordMessageId: existing?.discordMessageId,
    editedAt,
    ...(adminNote !== undefined && adminNote !== ''
      ? { adminNote }
      : existing?.adminNote !== undefined
        ? { adminNote: existing.adminNote }
        : {}),
  };

  await client.send(new PutCommand({
    TableName: tableName,
    Item: record,
  }));

  if (status === 'published') {
    const { publishedIndex } = buildAnnouncementPutItems(record);
    await client.send(new PutCommand({
      TableName: tableName,
      Item: publishedIndex,
    }));
  }

  return { ok: true, data: { id, status, updatedAt: now } };
}

async function persistAnnouncementRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  record: AnnouncementRecord,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: record,
  }));
  if (record.status === 'published') {
    const { publishedIndex } = buildAnnouncementPutItems(record);
    await client.send(new PutCommand({
      TableName: tableName,
      Item: publishedIndex,
    }));
  }
}

export async function announcementGetAdmin(
  client: DynamoDBDocumentClient,
  tableName: string,
  s3: S3Client | null,
  id: string,
): Promise<AnnouncementsResult<{
  id: string;
  status: AnnouncementStatus;
  title: string;
  body: string;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
  attachmentKeys?: string[];
  adminNote?: string;
  attachmentUrls?: { key: string; url: string }[];
}>> {
  const trimmed = id?.trim();
  if (!trimmed) {
    return { ok: false, message: 'id is required.', statusCode: 400 };
  }
  const row = await loadCanonical(client, tableName, trimmed);
  if (!row) {
    return { ok: false, message: 'Announcement not found.', statusCode: 404 };
  }

  const keys = row.attachmentKeys ?? [];
  let attachmentUrls: { key: string; url: string }[] | undefined;
  if (keys.length > 0 && s3) {
    attachmentUrls = await presignAnnouncementAttachmentUrls(s3, keys);
  }

  return {
    ok: true,
    data: {
      id: row.id,
      status: row.status,
      title: row.title,
      body: row.body,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      attachmentKeys: row.attachmentKeys,
      adminNote: row.adminNote,
      attachmentUrls,
    },
  };
}

export type AnnouncementPresignUploadPars = {
  announcementId: string;
  filename: string;
  contentType: string;
  contentLength: number;
};

export async function announcementPresignUpload(
  s3: S3Client,
  client: DynamoDBDocumentClient,
  tableName: string,
  pars: AnnouncementPresignUploadPars,
): Promise<AnnouncementsResult<{ uploadUrl: string; key: string; headers: Record<string, string> }>> {
  const announcementId = pars.announcementId?.trim();
  if (!announcementId) {
    return { ok: false, message: 'announcementId is required.', statusCode: 400 };
  }
  const row = await loadCanonical(client, tableName, announcementId);
  if (!row) {
    return { ok: false, message: 'Announcement not found.', statusCode: 404 };
  }
  if (row.status === 'retracted') {
    return { ok: false, message: 'Cannot upload to a retracted announcement.', statusCode: 400 };
  }

  const contentType = pars.contentType?.trim();
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return { ok: false, message: 'Unsupported image type.', statusCode: 400 };
  }
  if (!Number.isFinite(pars.contentLength) || pars.contentLength <= 0 || pars.contentLength > MAX_UPLOAD_BYTES) {
    return { ok: false, message: 'File too large.', statusCode: 400 };
  }

  const bucket = getAnnouncementsAttachmentsBucket();
  const ext = EXT_FOR_TYPE[contentType] ?? 'png';
  const safeName = sanitizeFilename(pars.filename ?? `image.${ext}`);
  const key = `${authorAttachmentPrefix(announcementId)}${randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_PUT_TTL });

  return {
    ok: true,
    data: {
      uploadUrl,
      key,
      headers: { 'Content-Type': contentType },
    },
  };
}

export async function announcementSaveWithOptionalRss(
  client: DynamoDBDocumentClient,
  tableName: string,
  s3: S3Client | null,
  pars: AnnouncementSavePars,
): Promise<AnnouncementsResult<{ id: string; status: AnnouncementStatus; updatedAt: number }>> {
  const saveResult = await announcementSave(client, tableName, pars);
  if (!saveResult.ok) {
    return saveResult;
  }
  if (saveResult.data.status === 'published' && s3) {
    const rss = await syncAnnouncementsRss(s3, client, tableName);
    if (!rss.ok) {
      return { ok: false, message: rss.message, statusCode: 500 };
    }
  }
  return saveResult;
}

export async function announcementPublish(
  client: DynamoDBDocumentClient,
  tableName: string,
  s3: S3Client | null,
  id: string,
): Promise<AnnouncementsResult<{ id: string; publishedAt: number }>> {
  if (process.env.WEBSOCKET_STAGE === 'dev') {
    return {
      ok: false,
      message: 'Publishing announcements is disabled on dev.',
      statusCode: 403,
      code: 'announcements_publish_disabled_on_dev',
    };
  }

  const trimmed = id?.trim();
  if (!trimmed) {
    return { ok: false, message: 'id is required.', statusCode: 400 };
  }

  const existing = await loadCanonical(client, tableName, trimmed);
  if (!existing) {
    return { ok: false, message: 'Announcement not found.', statusCode: 404 };
  }
  if (existing.status === 'published') {
    return { ok: false, message: 'Announcement is already published.', statusCode: 400 };
  }
  if (existing.status !== 'draft') {
    return { ok: false, message: 'Only drafts can be published.', statusCode: 400 };
  }
  if (!existing.title?.trim() || !existing.body?.trim()) {
    return { ok: false, message: 'title and body are required before publish.', statusCode: 400 };
  }

  const now = Date.now();
  let record: AnnouncementRecord = {
    ...existing,
    status: 'published',
    publishedAt: now,
    updatedAt: now,
    reactionCounts: existing.reactionCounts ?? {},
  };

  await persistAnnouncementRecord(client, tableName, record);

  const siteUrl = announcementsSiteUrl();
  if (!record.discordMessageId) {
    const discord = await postAnnouncementDiscordMirror(
      record.title,
      record.body,
      record.id,
      siteUrl,
    );
    if (!discord.ok) {
      return { ok: false, message: discord.message, statusCode: 502 };
    }
    if (discord.posted && discord.messageId) {
      record = { ...record, discordMessageId: discord.messageId, updatedAt: Date.now() };
      await persistAnnouncementRecord(client, tableName, record);
    }
  }

  if (s3) {
    const rss = await syncAnnouncementsRss(s3, client, tableName);
    if (!rss.ok) {
      return { ok: false, message: rss.message, statusCode: 500 };
    }
  }

  return { ok: true, data: { id: existing.id, publishedAt: now } };
}

/** Re-export public get for tests */
export { announcementGet };
