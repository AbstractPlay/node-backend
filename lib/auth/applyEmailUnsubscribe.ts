import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { disableAllEmailNotifications } from '../emailUnsubscribeSettings.js';
import {
  normalizeNotificationEmail,
  verifyEmailUnsubscribeToken,
} from '../emailUnsubscribeToken.js';

export async function applyEmailUnsubscribeToken(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }

  const verified = verifyEmailUnsubscribeToken(trimmed);
  if (!verified) {
    return false;
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    console.error('applyEmailUnsubscribeToken: ABSTRACT_PLAY_TABLE missing');
    return false;
  }

  const userRow = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: verified.userId },
    }),
  );
  if (!userRow.Item) {
    return false;
  }

  if (verified.email) {
    const stored = userRow.Item.email;
    if (typeof stored !== 'string' || !stored.trim()) {
      return false;
    }
    if (normalizeNotificationEmail(stored) !== verified.email) {
      return false;
    }
  }

  const result = await disableAllEmailNotifications(verified.userId);
  if (result !== 'ok') {
    return false;
  }

  console.log('email_unsubscribe ok', { userId: verified.userId });
  return true;
}