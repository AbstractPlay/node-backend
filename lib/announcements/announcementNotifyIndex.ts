import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
export type AnnouncementNotifyUser = {
  id: string;
  name?: string;
  email?: string;
  settings?: {
    all?: {
      notifications?: Record<string, boolean | undefined>;
    };
  };
};

/** Email and push use `settings.all.notifications.announcements` (default off). */
export function userWantsAnnouncementNotifications(
  settings: AnnouncementNotifyUser['settings'],
): boolean {
  const notifications = settings?.all?.notifications;
  if (!notifications || !Object.prototype.hasOwnProperty.call(notifications, 'announcements')) {
    return false;
  }
  return notifications.announcements === true;
}

export const ANNOUNCEMENT_NOTIFY_PK = 'ANNOUNCEMENT_NOTIFY';

export function announcementNotifySk(userId: string): string {
  return `USER#${userId}`;
}

export function wantsAnnouncementsEmailFromSettings(settings: unknown): boolean {
  if (settings === null || typeof settings !== 'object') {
    return false;
  }
  const all = (settings as { all?: unknown }).all;
  if (all === null || typeof all !== 'object') {
    return false;
  }
  return userWantsAnnouncementNotifications({
    all: all as NonNullable<AnnouncementNotifyUser['settings']>['all'],
  });
}

export async function syncAnnouncementNotifyIndex(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  settings: unknown,
): Promise<void> {
  const enabled = wantsAnnouncementsEmailFromSettings(settings);
  const pk = ANNOUNCEMENT_NOTIFY_PK;
  const sk = announcementNotifySk(userId);
  if (enabled) {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk,
        sk,
        entityType: 'announcementNotify',
        userId,
      },
    }));
  } else {
    await client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk, sk },
    }));
  }
}

export async function listAnnouncementNotifyUserIds(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<string[]> {
  const userIds: string[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': ANNOUNCEMENT_NOTIFY_PK,
        ':prefix': 'USER#',
      },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    for (const item of result.Items ?? []) {
      const id = typeof item.userId === 'string'
        ? item.userId
        : String(item.sk).replace(/^USER#/, '');
      if (id) {
        userIds.push(id);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return userIds;
}

export async function loadAnnouncementNotifyUsers(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<AnnouncementNotifyUser[]> {
  const userIds = await listAnnouncementNotifyUserIds(client, tableName);
  if (userIds.length === 0) {
    return [];
  }
  const users: AnnouncementNotifyUser[] = [];
  const unique = [...new Set(userIds)];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const response = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map((id) => ({ pk: 'USER', sk: id })),
        },
      },
    }));
    for (const row of response.Responses?.[tableName] ?? []) {
      users.push({
        id: String(row.sk ?? row.id),
        name: typeof row.name === 'string' ? row.name : undefined,
        email: typeof row.email === 'string' ? row.email : undefined,
        settings: row.settings as AnnouncementNotifyUser['settings'],
      });
    }
  }
  return users;
}
