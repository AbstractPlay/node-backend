import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb.js';
export async function getPlayerRelationIds(userId: string, skPrefix: string): Promise<string[]> {
  const ids: string[] = [];
  let result = await ddbDocClient.send(
    new QueryCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": "PLAYER#" + userId,
        ":skPrefix": skPrefix,
      },
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ProjectionExpression: "#sk",
    })
  );
  if (result.Items !== undefined) {
    for (const item of result.Items) {
      ids.push((item.sk as string).slice(skPrefix.length));
    }
  }
  let last = result.LastEvaluatedKey;
  while (last !== undefined) {
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": "PLAYER#" + userId,
          ":skPrefix": skPrefix,
        },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#sk",
        ExclusiveStartKey: last,
      })
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
