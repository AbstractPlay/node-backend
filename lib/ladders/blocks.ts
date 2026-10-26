import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** True if `blocker` has blocked `blocked`. */
export async function isPlayerBlocked(
  client: DynamoDBDocumentClient,
  tableName: string,
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `PLAYER#${blockerId}`, sk: `BLOCKED#${blockedId}` },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  return data.Item !== undefined;
}

/** Pool pairing: skip if either player blocked the other. */
export async function ladderPoolPairBlocked(
  client: DynamoDBDocumentClient,
  tableName: string,
  userA: string,
  userB: string,
): Promise<boolean> {
  const [aBlocksB, bBlocksA] = await Promise.all([
    isPlayerBlocked(client, tableName, userA, userB),
    isPlayerBlocked(client, tableName, userB, userA),
  ]);
  return aBlocksB || bBlocksA;
}
