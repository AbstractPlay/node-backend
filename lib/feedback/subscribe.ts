import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { postPk } from './keys.js';

export async function listSubscriberIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  postId: string,
): Promise<string[]> {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': postPk(postId),
      ':prefix': 'SUB#',
    },
  }));
  return (result.Items ?? []).map((item) => String(item.userId));
}

export async function isUserSubscribed(
  client: DynamoDBDocumentClient,
  tableName: string,
  postId: string,
  userId: string,
): Promise<boolean> {
  const ids = await listSubscriberIds(client, tableName, postId);
  return ids.includes(userId);
}
