
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getConnection, deleteConnection } from '../../lib/wsConnectionStore.js';
import { enqueuePresenceEvent } from '../../lib/wsPresence.js';
import { standDownArenaPlayReadyForUser } from '../../lib/arena/arenaLaunchSync.js';

const REGION = 'us-east-1';
const clnt = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
});

interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const handler = async (event: WebSocketDisconnectEvent) => {
  const { connectionId } = event.requestContext;

  try {
    const conn = await getConnection(connectionId);

    await deleteConnection(connectionId);

    if (conn?.userId) {
      await standDownArenaPlayReadyForUser(ddbDocClient, conn.userId);
      await enqueuePresenceEvent({
        type: "leave",
        userId: conn.userId,
        invisible: conn.invisible,
      });
    }
  } catch (err) {
    console.error("Disconnect cleanup failed", err);
  }

  return { statusCode: 200 };
};
