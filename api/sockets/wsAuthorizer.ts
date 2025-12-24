import { CognitoJwtVerifier } from "aws-jwt-verify";

interface WebSocketAuthorizerEvent {
  type: string;
  methodArn: string;
  headers?: Record<string, string>;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.userpoolId!,
  tokenUse: "id",
  clientId: process.env.userpoolClient!,
});

export const wsAuthorizer = async (event: WebSocketAuthorizerEvent) => {
  // API Gateway normalizes header keys to lowercase
  const token =
    event.headers?.["sec-websocket-protocol"] ||
    event.headers?.["Sec-WebSocket-Protocol"];

  if (!token) {
    console.error("Missing Sec-WebSocket-Protocol header");
    return { isAuthorized: false };
  }

  try {
    console.log(`Verifying JWT: ${token}`);
    const payload = await verifier.verify(token);
    console.log(`Validated: ${JSON.stringify(payload)}`);
    return {
      isAuthorized: true,
      context: {
        userId: payload.sub,
        email: payload.email,
      },
    };
  } catch (err) {
    console.error("JWT verification failed", err);
    return { isAuthorized: false };
  }
};