import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getConnections } from "./getConnections.js";
import { listAllConnections, wantsPresenceUpdates } from "./wsConnectionStore.js";
import { postToConnection, postToMany } from "./wsPost.js";

const REGION = "us-east-1";
const ddbLow = new DynamoDBClient({ region: REGION });
const ddbDoc = DynamoDBDocumentClient.from(ddbLow, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
});
const sqs = new SQSClient({ region: REGION });

const PRESENCE_PK = "wsMeta";
const PRESENCE_SK = "presenceSeq";

export type PresenceSnapshot = {
  type: "snapshot";
  seq: number;
  totalCount: number;
  visibleUserIds: string[];
};

export type PresenceDelta = {
  type: "delta";
  seq: number;
  joins: string[];
  leaves: string[];
};

export type PresenceEvent = {
  type: "join" | "leave";
  userId: string;
  invisible?: boolean;
};

export async function getPresenceSeq(): Promise<number> {
  const result = await ddbDoc.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: PRESENCE_PK, sk: PRESENCE_SK },
    })
  );
  const seq = result.Item?.seq;
  return typeof seq === "number" ? seq : 0;
}

async function incrementPresenceSeq(): Promise<number> {
  const result = await ddbLow.send(
    new UpdateItemCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE!,
      Key: {
        pk: { S: PRESENCE_PK },
        sk: { S: PRESENCE_SK },
      },
      UpdateExpression: "ADD #seq :one",
      ExpressionAttributeNames: { "#seq": "seq" },
      ExpressionAttributeValues: { ":one": { N: "1" } },
      ReturnValues: "UPDATED_NEW",
    })
  );
  const raw = result.Attributes?.seq?.N;
  return raw ? parseInt(raw, 10) : 1;
}

export async function buildPresenceSnapshot(): Promise<PresenceSnapshot> {
  const [conns, seq] = await Promise.all([getConnections(), getPresenceSeq()]);
  return {
    type: "snapshot",
    seq,
    totalCount: conns.totalCount,
    visibleUserIds: conns.visibleUserIds,
  };
}

export async function sendPresenceSnapshot(
  endpoint: string,
  connectionId: string
): Promise<void> {
  const snapshot = await buildPresenceSnapshot();
  await postToConnection(endpoint, connectionId, {
    verb: "connections",
    payload: snapshot,
  });
}

export async function enqueuePresenceEvent(
  event: PresenceEvent
): Promise<void> {
  const queueUrl = process.env.PRESENCE_COALESCE_SQS;
  if (!queueUrl) {
    console.error("PRESENCE_COALESCE_SQS is not configured");
    return;
  }
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(event),
    })
  );
}

export async function broadcastPresenceDelta(
  joins: string[],
  leaves: string[]
): Promise<void> {
  if (joins.length === 0 && leaves.length === 0) {
    return;
  }
  const seq = await incrementPresenceSeq();
  const payload: PresenceDelta = { type: "delta", seq, joins, leaves };
  const connections = await listAllConnections();
  const now = Math.floor(Date.now() / 1000);
  const targets: { endpoint: string; connectionId: string }[] = [];

  for (const conn of connections) {
    if (conn.ttl && conn.ttl < now) {
      continue;
    }
    if (!wantsPresenceUpdates(conn)) {
      continue;
    }
    targets.push({ endpoint: conn.endpoint, connectionId: conn.sk });
  }

  await postToMany(targets, { verb: "connections", payload });
}

export function mergePresenceBatch(events: PresenceEvent[]): {
  joins: string[];
  leaves: string[];
} {
  const joinSet = new Set<string>();
  const leaveSet = new Set<string>();

  for (const ev of events) {
    if (ev.type === "join" && !ev.invisible && ev.userId) {
      joinSet.add(ev.userId);
    } else if (ev.type === "leave" && ev.userId) {
      leaveSet.add(ev.userId);
    }
  }

  for (const userId of joinSet) {
    if (leaveSet.has(userId)) {
      joinSet.delete(userId);
      leaveSet.delete(userId);
    }
  }

  return {
    joins: [...joinSet],
    leaves: [...leaveSet],
  };
}
