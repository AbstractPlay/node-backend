import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb.js';

async function queryPlayerRelationIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  skPrefix: string,
): Promise<string[]> {
  const ids: string[] = [];
  let result = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `PLAYER#${userId}`,
        ':skPrefix': skPrefix,
      },
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ProjectionExpression: '#sk',
    }),
  );
  if (result.Items !== undefined) {
    for (const item of result.Items) {
      ids.push((item.sk as string).slice(skPrefix.length));
    }
  }
  let last = result.LastEvaluatedKey;
  while (last !== undefined) {
    result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': `PLAYER#${userId}`,
          ':skPrefix': skPrefix,
        },
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ProjectionExpression: '#sk',
        ExclusiveStartKey: last,
      }),
    );
    if (result.Items !== undefined) {
      for (const item of result.Items) {
        ids.push((item.sk as string).slice(skPrefix.length));
      }
    }
    last = result.LastEvaluatedKey;
  }
  return ids;
}

export async function getPlayerRelationIds(userId: string, skPrefix: string): Promise<string[]> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE is not configured.');
  }
  return queryPlayerRelationIds(ddbDocClient, tableName, userId, skPrefix);
}

/** Ops/read-only tools (e.g. dump-dashboard) with their own DynamoDB client and table. */
export async function listBlockedPlayerIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<string[]> {
  return queryPlayerRelationIds(client, tableName, userId, 'BLOCKED#');
}
