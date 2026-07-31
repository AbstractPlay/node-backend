"use strict";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  connectionTtl,
  gameWatchKey,
  getConnection,
} from "../../lib/wsConnectionStore";

type WebSocketRequestContext = APIGatewayProxyEventV2["requestContext"] & {
  connectionId: string;
};

interface WebSocketEvent extends Omit<APIGatewayProxyEventV2, "requestContext"> {
  requestContext: WebSocketRequestContext;
}

type GameRef = { meta: string; id: string };

const REGION = "us-east-1";
const clnt = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
});

export const handler = async (event: WebSocketEvent) => {
  const { connectionId } = event.requestContext;
  const body = JSON.parse(event.body ?? "{}");
  const games: GameRef[] = Array.isArray(body.games) ? body.games : [];

  const existing = await getConnection(connectionId);
  if (!existing) {
    return { statusCode: 403, body: "Not subscribed" };
  }

  const watchingGames = new Set<string>();
  for (const g of games) {
    if (g?.meta && g?.id) {
      watchingGames.add(gameWatchKey(g.meta, g.id));
    }
  }

  const updateExpr =
    watchingGames.size > 0
      ? "SET watchingGames = :wg, #ttl = :ttl, watchVersion = :wv"
      : "REMOVE watchingGames SET #ttl = :ttl, watchVersion = :wv";

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE!,
      Key: { pk: "wsConnections", sk: connectionId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":wg": watchingGames,
        ":ttl": connectionTtl(),
        ":wv": 1,
      },
    })
  );

  return { statusCode: 200 };
};
