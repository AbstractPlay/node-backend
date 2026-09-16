import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AnnouncementsResult } from './access.js';

export async function announcementsMarkRead(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  readAt?: number,
): Promise<AnnouncementsResult<{ announcementsLastReadAt: number }>> {
  const at = Number.isFinite(readAt) && readAt! > 0 ? readAt! : Date.now();

  const user = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
  }));
  if (!user.Item) {
    return { ok: false, message: 'User not found.', statusCode: 404 };
  }

  const settings = { ...((user.Item.settings ?? {}) as Record<string, unknown>) };
  const all = { ...((settings.all ?? {}) as Record<string, unknown>) };
  const prev = Number(all.announcementsLastReadAt ?? 0);
  const next = Math.max(prev, at);
  all.announcementsLastReadAt = next;
  settings.all = all;

  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    UpdateExpression: 'SET settings = :settings',
    ExpressionAttributeValues: { ':settings': settings },
  }));

  return { ok: true, data: { announcementsLastReadAt: next } };
}
