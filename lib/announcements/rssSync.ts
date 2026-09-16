import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { announcementsList } from './access.js';
import { buildAnnouncementsRss } from './rss.js';
import { announcementsSiteUrl } from './siteUrl.js';

async function fetchAllPublished(
  client: DynamoDBDocumentClient,
  tableName: string,
) {
  const items = [];
  let cursor: string | undefined;
  do {
    const result = await announcementsList(client, tableName, { limit: 100, cursor });
    if (!result.ok) {
      throw new Error(result.message);
    }
    items.push(...result.data.items);
    cursor = result.data.nextCursor;
  } while (cursor);
  return items;
}

export async function syncAnnouncementsRss(
  s3: S3Client | null,
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<{ ok: true; uploaded: boolean; itemCount: number } | { ok: false; message: string }> {
  const bucket = process.env.ANNOUNCEMENTS_RSS_BUCKET?.trim();
  const key = process.env.ANNOUNCEMENTS_RSS_KEY?.trim() || 'news.rss';
  if (!bucket || !s3) {
    return { ok: true, uploaded: false, itemCount: 0 };
  }

  try {
    const items = await fetchAllPublished(client, tableName);
    const xml = buildAnnouncementsRss(items, { siteUrl: announcementsSiteUrl() });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: xml,
      ContentType: 'application/rss+xml; charset=utf-8',
      CacheControl: 'max-age=300',
    }));
    return { ok: true, uploaded: true, itemCount: items.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RSS sync failed';
    return { ok: false, message };
  }
}
