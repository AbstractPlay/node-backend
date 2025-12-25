import {
  DynamoDBClient,
  QueryCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

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

export const handler = async (event: any) => {
  // SQS may batch multiple messages
  for (const record of event.Records) {
    await processRecord(record);
  }

  return { statusCode: 200 };
};

async function processRecord(record: any) {
  let body;
  try {
    body = JSON.parse(record.body);
  } catch {
    console.error("Invalid SQS message JSON", record.body);
    return;
  }

  const { verb, payload, domainName, stage } = body;

  if (!domainName || !stage) {
    console.error("Missing domainName or stage in SQS message");
    return;
  }

  // Only accept "chat" and "game"
  if (verb !== "chat" && verb !== "game") {
    console.warn("Unsupported verb:", verb);
    return;
  }

  const apigw = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  // Query all active connections
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE!,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: "wsConnections" },
      },
    })
  );

  const now = Math.floor(Date.now() / 1000);

  for (const item of result.Items ?? []) {
    const connectionId = item.sk.S!;
    const ttl = item.ttl?.N ? parseInt(item.ttl.N) : null;

    // Delete expired TTL entries
    if (ttl && ttl < now) {
      await deleteConnection(connectionId);
      continue;
    }

    try {
      await apigw.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify({ verb, payload })),
        })
      );
    } catch (err: any) {
      // 410 Gone → stale connection
      if (err.statusCode === 410) {
        await deleteConnection(connectionId);
      } else {
        console.error("Error posting to connection", err);
      }
    }
  }
}

async function deleteConnection(connectionId: string) {
  try {
    await ddbDocClient.send(
      new DeleteItemCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE!,
        Key: {
          pk: { S: "wsConnections" },
          sk: { S: connectionId },
        },
      })
    );
  } catch (err) {
    console.error("Failed to delete connection", err);
  }
}
