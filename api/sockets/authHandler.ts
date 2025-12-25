import { ApiGatewayManagementApiClient, DeleteConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

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

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.userpoolId!,
  tokenUse: "id",
  clientId: process.env.userpoolClient!,
});

export const wsAuthorizer = async (event: WebSocketEvent) => {

   // Parse the incoming message body
    const body = JSON.parse(event.body ?? "{}");
    const token: string | undefined = body.token;

  if (!token) {
     console.error("Missing token in auth message");
      return { statusCode: 400, body: "Missing token" };
  }

  try {
    console.log(`Verifying JWT: ${token}`);
    const payload = await verifier.verify(token);
    console.log(`Validated: ${JSON.stringify(payload)}`);
    const { connectionId } = event.requestContext;

    const userId = payload.sub;

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
    const domain = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const connectionId = event.requestContext.connectionId;

    const mgmt = new ApiGatewayManagementApiClient({
      endpoint: `https://${domain}/${stage}`,
    });

    await mgmt.send(new DeleteConnectionCommand({ ConnectionId: connectionId }));
    return { statusCode: 401 };
  }
};
