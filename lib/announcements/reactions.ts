import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ANNOUNCEMENT_PK, announcementSk } from './keys.js';
import { buildAnnouncementPutItems } from './access.js';
import type { AnnouncementRecord } from './types.js';
import type { AnnouncementsResult } from './access.js';

/** Site reaction palette (minimal v1). */
export const ALLOWED_ANNOUNCEMENT_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '😊',
  '😮',
  '🙏',
  '🎉',
  '👀',
] as const;

export type AllowedReaction = typeof ALLOWED_ANNOUNCEMENT_REACTIONS[number];

export function isAllowedReaction(emoji: string): boolean {
  return (ALLOWED_ANNOUNCEMENT_REACTIONS as readonly string[]).includes(emoji);
}

export function reactionSk(announcementId: string, emoji: string, userId: string): string {
  return `REACTION#${announcementId}#${userId}#${encodeURIComponent(emoji)}`;
}

function emojiFromReactionSk(sk: string): string | null {
  const parts = sk.split('#');
  if (parts.length < 4 || parts[0] !== 'REACTION') {
    return null;
  }
  const encoded = parts.slice(3).join('#');
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function isReactionRow(sk: string): boolean {
  return sk.startsWith('REACTION#');
}

async function loadAnnouncement(
  client: DynamoDBDocumentClient,
  tableName: string,
  id: string,
): Promise<AnnouncementRecord | null> {
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ANNOUNCEMENT_PK, sk: announcementSk(id) },
  }));
  if (!result.Item || isReactionRow(String(result.Item.sk))) {
    return null;
  }
  return result.Item as AnnouncementRecord;
}

async function writeAnnouncementCounts(
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

export async function announcementReact(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  announcementId: string,
  emoji: string,
): Promise<AnnouncementsResult<{
  id: string;
  reactionCounts: Record<string, number>;
  myReactions: string[];
}>> {
  const id = announcementId?.trim();
  if (!id) {
    return { ok: false, message: 'id is required.', statusCode: 400 };
  }
  if (!isAllowedReaction(emoji)) {
    return { ok: false, message: 'emoji not allowed.', statusCode: 400 };
  }

  const record = await loadAnnouncement(client, tableName, id);
  if (!record || record.status !== 'published') {
    return { ok: false, message: 'Announcement not found.', statusCode: 404 };
  }

  const rSk = reactionSk(id, emoji, userId);
  const existing = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ANNOUNCEMENT_PK, sk: rSk },
  }));

  const counts = { ...(record.reactionCounts ?? {}) };
  const had = Boolean(existing.Item);

  if (had) {
    await client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: ANNOUNCEMENT_PK, sk: rSk },
    }));
    counts[emoji] = Math.max(0, (counts[emoji] ?? 1) - 1);
    if (counts[emoji] === 0) {
      delete counts[emoji];
    }
  } else {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: ANNOUNCEMENT_PK,
        sk: rSk,
        announcementId: id,
        emoji,
        userId,
        createdAt: Date.now(),
      },
    }));
    counts[emoji] = (counts[emoji] ?? 0) + 1;
  }

  const updated: AnnouncementRecord = {
    ...record,
    reactionCounts: counts,
    updatedAt: Date.now(),
  };
  await writeAnnouncementCounts(client, tableName, updated);

  const mine = await announcementReactionsMine(client, tableName, userId, [id]);
  const myReactions = mine.ok ? mine.data.byAnnouncementId[id] ?? [] : [];

  return {
    ok: true,
    data: {
      id,
      reactionCounts: counts,
      myReactions,
    },
  };
}

export async function announcementReactionsMine(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  ids: string[],
): Promise<AnnouncementsResult<{ byAnnouncementId: Record<string, string[]> }>> {
  const uniqueIds = [...new Set((ids ?? []).map((x) => x?.trim()).filter(Boolean))];
  const byAnnouncementId: Record<string, string[]> = {};
  for (const id of uniqueIds) {
    byAnnouncementId[id] = [];
  }
  if (uniqueIds.length === 0) {
    return { ok: true, data: { byAnnouncementId } };
  }

  for (const id of uniqueIds) {
    const prefix = `REACTION#${id}#`;
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': ANNOUNCEMENT_PK,
        ':prefix': prefix,
      },
    }));
    const emojis: string[] = [];
    for (const row of result.Items ?? []) {
      const sk = String(row.sk);
      if (!sk.startsWith(`REACTION#${id}#${userId}#`)) {
        continue;
      }
      const emoji = emojiFromReactionSk(sk);
      if (emoji && isAllowedReaction(emoji)) {
        emojis.push(emoji);
      }
    }
    byAnnouncementId[id] = emojis;
  }

  return { ok: true, data: { byAnnouncementId } };
}
