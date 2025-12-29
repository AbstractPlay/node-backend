import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const REGION = "us-east-1";
const clnt = new DynamoDBClient({ region: REGION });
const marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false, // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true, // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false, // false, by default.
};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = DynamoDBDocumentClient.from(clnt, translateConfig);

export async function getConnections(): Promise<{
  totalCount: number;
  visibleUserIds: string[];
}> {
  const allUsers = new Set<string>();
  const visibleUsers = new Set<string>();
  let lastKey: Record<string, any> | undefined = undefined;

  do {
    const params: QueryCommandInput = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": "wsConnections",
      },
      // Only fetch what we need
      ProjectionExpression: "userId, invisible",
      ExclusiveStartKey: lastKey,
    };

    const result = await ddbDocClient.send(new QueryCommand(params));
    const items = result.Items ?? [];

    // Collect userIds where invisible is missing or false
    for (const item of items) {
      allUsers.add(item.userId);
      if (item.invisible !== true) {
        // invisible is undefined OR false
        if (item.userId) {
          visibleUsers.add(item.userId);
        }
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return { totalCount: allUsers.size, visibleUserIds: [...visibleUsers] };
}
