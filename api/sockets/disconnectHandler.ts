
import { getConnection, deleteConnection } from '../../lib/wsConnectionStore.js';
import { enqueuePresenceEvent } from '../../lib/wsPresence.js';

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
