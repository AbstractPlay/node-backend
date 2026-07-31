"use strict";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getConnection } from "../../lib/wsConnectionStore";
import { sendPresenceSnapshot } from "../../lib/wsPresence";

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

  await sendPresenceSnapshot(conn.endpoint, connectionId);
  return { statusCode: 200 };
};
