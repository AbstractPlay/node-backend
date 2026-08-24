"use strict";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getConnection } from "../../lib/wsConnectionStore";
import { sendPresenceSnapshot } from "../../lib/wsPresence";
import { touchUserLastSeen } from "../../lib/touchUserLastSeen";

const REGION = "us-east-1";
const clnt = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
});

type WebSocketRequestContext = APIGatewayProxyEventV2["requestContext"] & {
  connectionId: string;
};

interface WebSocketEvent extends Omit<APIGatewayProxyEventV2, "requestContext"> {
  requestContext: WebSocketRequestContext;
}

export const handler = async (event: WebSocketEvent) => {
  const { connectionId } = event.requestContext;

  const conn = await getConnection(connectionId);
  if (!conn) {
    return { statusCode: 403, body: "Not subscribed" };
  }

  if (conn.userId) {
    await touchUserLastSeen(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      conn.userId,
    );
  }

  await sendPresenceSnapshot(conn.endpoint, connectionId);
  return { statusCode: 200 };
};
