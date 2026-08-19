import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const BLOCKED_SK_PREFIX = 'BLOCKED#';

export async function listBlockedPlayerIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `PLAYER#${userId}`,
        ':skPrefix': BLOCKED_SK_PREFIX,
      },
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ProjectionExpression: '#sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of result.Items ?? []) {
      ids.push((item.sk as string).slice(BLOCKED_SK_PREFIX.length));
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return ids;
}
