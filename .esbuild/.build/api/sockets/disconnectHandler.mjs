// lib/wsConnectionStore.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
var REGION = "us-east-1";
var clnt = new DynamoDBClient({ region: REGION });
var ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false }
});
async function getConnection(connectionId) {
  const result = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
  return result.Item;
}
async function deleteConnection(connectionId) {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
}

// lib/wsPresence.ts
import { DynamoDBClient as DynamoDBClient3, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient3, GetCommand as GetCommand2 } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// lib/getConnections.ts
import { DynamoDBDocumentClient as DynamoDBDocumentClient2, QueryCommand as QueryCommand2 } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";
var REGION2 = "us-east-1";
var clnt2 = new DynamoDBClient2({ region: REGION2 });
var marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false,
  // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true,
  // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false
  // false, by default.
};
var unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false
  // false, by default.
};
var translateConfig = { marshallOptions, unmarshallOptions };
var ddbDocClient2 = DynamoDBDocumentClient2.from(clnt2, translateConfig);

// lib/wsPost.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";

// lib/wsPresence.ts
var REGION3 = "us-east-1";
var ddbLow = new DynamoDBClient3({ region: REGION3 });
var ddbDoc = DynamoDBDocumentClient3.from(ddbLow, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var sqs = new SQSClient({ region: REGION3 });
async function enqueuePresenceEvent(event) {
  const queueUrl = process.env.PRESENCE_COALESCE_SQS;
  if (!queueUrl) {
    console.error("PRESENCE_COALESCE_SQS is not configured");
    return;
  }
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event)
    })
  );
}

// api/sockets/disconnectHandler.ts
var handler = async (event) => {
  const { connectionId } = event.requestContext;
  try {
    const conn = await getConnection(connectionId);
    await deleteConnection(connectionId);
    if (conn?.userId) {
      await enqueuePresenceEvent({
        type: "leave",
        userId: conn.userId,
        invisible: conn.invisible
      });
    }
  } catch (err) {
    console.error("Disconnect cleanup failed", err);
  }
  return { statusCode: 200 };
};
export {
  handler
};
