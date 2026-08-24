import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export const TOUCH_USER_LAST_SEEN_INTERVAL_MS = 15 * 60 * 1000;

function isConditionalFailure(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'ConditionalCheckFailedException';
}

/**
 * Throttled USERS lastSeen touch. Skips write when lastSeen is within TOUCH_USER_LAST_SEEN_INTERVAL_MS.
 */
export async function touchUserLastSeen(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now = Date.now(),
): Promise<boolean> {
  const touchBefore = now - TOUCH_USER_LAST_SEEN_INTERVAL_MS;
  try {
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USERS', sk: userId },
      ConditionExpression: 'attribute_not_exists(lastSeen) OR lastSeen < :touchBefore',
      UpdateExpression: 'SET lastSeen = :now',
      ExpressionAttributeValues: {
        ':now': now,
        ':touchBefore': touchBefore,
      },
    }));
    return true;
  } catch (err: unknown) {
    if (isConditionalFailure(err)) {
      return false;
    }
    throw err;
  }
}

export async function getUsersLastSeen(
  client: DynamoDBDocumentClient,
  tableName: string,
  userIds: string[],
): Promise<Map<string, number | undefined>> {
  const result = new Map<string, number | undefined>();
  if (userIds.length === 0) {
    return result;
  }

  const humanIds = [...new Set(userIds)];
  for (let i = 0; i < humanIds.length; i += 100) {
    const chunk = humanIds.slice(i, i + 100);
    const response = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(id => ({ pk: 'USERS', sk: id })),
          ProjectionExpression: 'sk, lastSeen',
        },
      },
    }));
    for (const item of response.Responses?.[tableName] ?? []) {
      const id = item.sk as string;
      result.set(id, typeof item.lastSeen === 'number' ? item.lastSeen : undefined);
    }
  }

  for (const id of humanIds) {
    if (!result.has(id)) {
      result.set(id, undefined);
    }
  }

  return result;
}
