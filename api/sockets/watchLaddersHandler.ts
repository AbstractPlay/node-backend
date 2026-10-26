"use strict";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  connectionTtl,
  getConnection,
  watchingLaddersFromIds,
} from "../../lib/wsConnectionStore.js";

type WebSocketRequestContext = APIGatewayProxyEventV2["requestContext"] & {
  connectionId: string;
};

interface WebSocketEvent extends Omit<APIGatewayProxyEventV2, "requestContext"> {
  requestContext: WebSocketRequestContext;
}

const REGION = "us-east-1";
const clnt = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
});

export const handler = async (event: WebSocketEvent) => {
  const { connectionId } = event.requestContext;
  const body = JSON.parse(event.body ?? "{}");
  const ladders: string[] = Array.isArray(body.ladders) ? body.ladders : [];

  const existing = await getConnection(connectionId);
  if (!existing) {
    return { statusCode: 403, body: "Not subscribed" };
  }

  const watchingLadders = watchingLaddersFromIds(ladders);

  const updateExpr =
    watchingLadders.size > 0
      ? "SET watchingLadders = :wl, #ttl = :ttl"
      : "REMOVE watchingLadders SET #ttl = :ttl";

  const values: Record<string, unknown> = {
    ":ttl": connectionTtl(),
  };
  if (watchingLadders.size > 0) {
    values[":wl"] = watchingLadders;
  }

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE!,
      Key: { pk: "wsConnections", sk: connectionId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: values,
    })
  );

  return { statusCode: 200 };
};
