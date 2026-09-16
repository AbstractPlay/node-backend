import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { FEEDBACK_KINDS } from './constants.js';
import { feedbackNotifyPk, feedbackNotifySk } from './keys.js';
import type { FeedbackKind } from './types.js';

export type FeedbackNewKindsSettings = Partial<Record<FeedbackKind, boolean>>;

export function feedbackNewKindsFromSettings(settings: unknown): FeedbackNewKindsSettings {
  if (settings === null || typeof settings !== 'object') {
    return {};
  }
  const all = (settings as { all?: unknown }).all;
  if (all === null || typeof all !== 'object') {
    return {};
  }
  const raw = (all as { feedbackNewKinds?: unknown }).feedbackNewKinds;
  if (raw === null || typeof raw !== 'object') {
    return {};
  }
  const result: FeedbackNewKindsSettings = {};
  for (const kind of FEEDBACK_KINDS) {
    if (Object.prototype.hasOwnProperty.call(raw, kind)) {
      result[kind] = (raw as Record<string, unknown>)[kind] === true;
    }
  }
  return result;
}

export function wantsFeedbackNewKindFromSettings(
  settings: unknown,
  kind: FeedbackKind,
): boolean {
  const kinds = feedbackNewKindsFromSettings(settings);
  return kinds[kind] === true;
}

export async function syncFeedbackNewNotifyIndex(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  userId: string,
  kinds: FeedbackNewKindsSettings,
): Promise<void> {
  for (const kind of FEEDBACK_KINDS) {
    const pk = feedbackNotifyPk(kind);
    const sk = feedbackNotifySk(userId);
    if (kinds[kind] === true) {
      await client.send(new PutCommand({
        TableName: feedbackTable,
        Item: {
          pk,
          sk,
          entityType: 'feedbackNewNotify',
          userId,
          kind,
        },
      }));
    } else {
      await client.send(new DeleteCommand({
        TableName: feedbackTable,
        Key: { pk, sk },
      }));
    }
  }
}

export async function listFeedbackNewNotifyUserIds(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  kind: FeedbackKind,
): Promise<string[]> {
  const userIds: string[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: feedbackTable,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': feedbackNotifyPk(kind),
        ':prefix': 'USER#',
      },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    for (const item of result.Items ?? []) {
      const id = typeof item.userId === 'string' ? item.userId : String(item.sk).replace(/^USER#/, '');
      if (id) {
        userIds.push(id);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return userIds;
}
