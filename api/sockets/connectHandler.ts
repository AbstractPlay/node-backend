'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    authorizer?: {
      userId?: string;
      email?: string;
      [key: string]: any;
    };
  };
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

export const handler = async (event: WebSocketConnectEvent) => {
  console.log("Connect event:", JSON.stringify(event));
  try {
    const { connectionId, authorizer } = event.requestContext;

    if (!authorizer?.userId) {
        console.error("Missing userId in authorizer context");
        return { statusCode: 401 };
    }

    const userId = authorizer.userId;

    await ddbDocClient.send(
        new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE!,
            Item: {
                pk: "wsConnections",
                sk: connectionId,

                connectionId,
                userId,

                // Optional TTL for auto-cleanup
                ttl: Math.floor(Date.now() / 1000) + 3600,
            },
        })
    );
  } catch (ex) {
    console.log("Connect error:", JSON.stringify(ex));
    return { statusCode: 500 };
  }

  return { statusCode: 200 };
};
