import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const DISPLAY_NAME_TAKEN_MESSAGE = 'That display name is already in use.';

export type DisplayNameDirectoryRow = {
  id: string;
  name: string;
};

/** Trim and fold case for uniqueness checks (stored name keeps caller casing). */
export function normalizeDisplayNameForUniqueness(name: string): string {
  return name.trim().toLowerCase();
}

export function findDisplayNameConflict(
  name: string,
  directory: DisplayNameDirectoryRow[],
  excludeUserId?: string,
): boolean {
  const normalized = normalizeDisplayNameForUniqueness(name);
  for (const row of directory) {
    if (excludeUserId !== undefined && row.id === excludeUserId) {
      continue;
    }
    if (typeof row.name !== 'string' || row.name.trim() === '') {
      continue;
    }
    if (normalizeDisplayNameForUniqueness(row.name) === normalized) {
      return true;
    }
  }
  return false;
}

export async function loadDisplayNameDirectory(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<DisplayNameDirectoryRow[]> {
  const [usersData, botData] = await Promise.all([
    client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'pk', '#name': 'name' },
        ExpressionAttributeValues: { ':pk': 'USERS' },
        ProjectionExpression: 'sk, #name',
      }),
    ),
    client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'pk', '#name': 'name' },
        ExpressionAttributeValues: { ':pk': 'BOT' },
        ProjectionExpression: 'sk, #name',
      }),
    ),
  ]);

  const rows: DisplayNameDirectoryRow[] = [];
  for (const item of usersData.Items ?? []) {
    if (typeof item.sk === 'string' && typeof item.name === 'string') {
      rows.push({ id: item.sk, name: item.name });
    }
  }
  for (const item of botData.Items ?? []) {
    if (typeof item.sk === 'string' && typeof item.name === 'string') {
      rows.push({ id: item.sk, name: item.name });
    }
  }
  return rows;
}

export async function isDisplayNameTaken(
  client: DynamoDBDocumentClient,
  tableName: string,
  name: string,
  excludeUserId?: string,
): Promise<boolean> {
  const directory = await loadDisplayNameDirectory(client, tableName);
  return findDisplayNameConflict(name, directory, excludeUserId);
}
