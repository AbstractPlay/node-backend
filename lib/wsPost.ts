import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { deleteConnection } from "./wsConnectionStore.js";

const clientCache = new Map<string, ApiGatewayManagementApiClient>();

function getClient(endpoint: string): ApiGatewayManagementApiClient {
  let client = clientCache.get(endpoint);
  if (!client) {
    client = new ApiGatewayManagementApiClient({ endpoint });
    clientCache.set(endpoint, client);
  }
  return client;
}

export async function postToConnection(
  endpoint: string,
  connectionId: string,
  data: unknown
): Promise<boolean> {
  try {
    await getClient(endpoint).send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      })
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410) {
      await deleteConnection(connectionId);
      return false;
    }
    console.error("Error posting to connection", connectionId, err);
    return false;
  }
}

const POST_CONCURRENCY = 10;

export async function postToMany(
  targets: { endpoint: string; connectionId: string }[],
  data: unknown
): Promise<void> {
  for (let i = 0; i < targets.length; i += POST_CONCURRENCY) {
    const batch = targets.slice(i, i + POST_CONCURRENCY);
    await Promise.all(
      batch.map((t) => postToConnection(t.endpoint, t.connectionId, data))
    );
  }
}
