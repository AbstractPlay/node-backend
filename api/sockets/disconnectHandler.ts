/* eslint-disable @typescript-eslint/ban-ts-comment */
'use strict';

import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
    [key: string]: any;
  };
  [key: string]: any;
}

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

export const handler = async (event: WebSocketDisconnectEvent) => {
//   console.log("Disconnect event:", JSON.stringify(event));
  const { connectionId } = event.requestContext;

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

    console.log(`Disconnected: ${connectionId}`);
  } catch (err) {
    console.error("Disconnect cleanup failed", err);
  }

  return { statusCode: 200 };
};
