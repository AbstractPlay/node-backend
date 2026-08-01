'use strict';

import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { connectionTtl, watchingGamesFromRefs } from '../../lib/wsConnectionStore';
import { enqueuePresenceEvent, sendPresenceSnapshot } from '../../lib/wsPresence';

type WebSocketRequestContext = APIGatewayProxyEventV2["requestContext"] & {
  connectionId: string;
  routeKey: string;
  eventType: "CONNECT" | "MESSAGE" | "DISCONNECT";
};

interface WebSocketEvent extends Omit<APIGatewayProxyEventV2, "requestContext"> {
  requestContext: WebSocketRequestContext;
}

const REGION = "us-east-1";
const clnt = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
});

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.userpoolId!,
  tokenUse: "id",
  clientId: process.env.userpoolClient!,
});

export const handler = async (event: WebSocketEvent) => {
  const body = JSON.parse(event.body ?? "{}");
  const token: string | undefined = body.token;
  const invisible: boolean = body.invisible ?? false;
  const watchVersion: number | undefined = body.watchVersion;
  const wantsPresence: boolean = body.wantsPresence !== false;
  const games: unknown = body.games;

  if (!token) {
    console.error("Missing token in auth message");
    return { statusCode: 400, body: "Missing token" };
  }

  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  try {
    const payload = await verifier.verify(token);
    const { connectionId } = event.requestContext;
    const userId = payload.sub;
    const endpoint = `https://${domain}/${stage}`;

    const item: Record<string, unknown> = {
      pk: "wsConnections",
      sk: connectionId,
      connectionId,
      userId,
      invisible,
      endpoint,
      wantsPresence,
      ttl: connectionTtl(),
    };

    if (watchVersion === 1) {
      item.watchVersion = 1;
    }

    const watchingGames = watchingGamesFromRefs(games);
    if (watchingGames.size > 0) {
      item.watchingGames = watchingGames;
    }

    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE!,
        Item: item,
      })
    );

    await sendPresenceSnapshot(endpoint, connectionId);

    if (!invisible) {
      await enqueuePresenceEvent({ type: "join", userId, invisible });
    }

    return { statusCode: 200 };
  } catch (ex) {
    console.log("Subscribe error:", ex);
    return { statusCode: 500 };
  }
};
