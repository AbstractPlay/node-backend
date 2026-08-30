// lib/wsPresence.ts
import { DynamoDBClient as DynamoDBClient3, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient3, GetCommand as GetCommand2 } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// lib/getConnections.ts
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
var REGION = "us-east-1";
var clnt = new DynamoDBClient({ region: REGION });
var marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false,
  // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true,
  // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false
  // false, by default.
};
var unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false
  // false, by default.
};
var translateConfig = { marshallOptions, unmarshallOptions };
var ddbDocClient = DynamoDBDocumentClient.from(clnt, translateConfig);

// lib/wsConnectionStore.ts
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient as DynamoDBDocumentClient2,
  DeleteCommand,
  GetCommand,
  QueryCommand as QueryCommand2
} from "@aws-sdk/lib-dynamodb";
var REGION2 = "us-east-1";
var clnt2 = new DynamoDBClient2({ region: REGION2 });
var ddbDocClient2 = DynamoDBDocumentClient2.from(clnt2, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false }
});
async function listAllConnections() {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "wsConnections" },
      ExclusiveStartKey: lastKey
    };
    const result = await ddbDocClient2.send(new QueryCommand2(params));
    for (const item of result.Items ?? []) {
      items.push(item);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
async function deleteConnection(connectionId) {
  await ddbDocClient2.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
}
function wantsPresenceUpdates(conn) {
  return conn.wantsPresence !== false;
}

// lib/wsPost.ts
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";
var clientCache = /* @__PURE__ */ new Map();
function getClient(endpoint) {
  let client = clientCache.get(endpoint);
  if (!client) {
    client = new ApiGatewayManagementApiClient({ endpoint });
    clientCache.set(endpoint, client);
  }
  return client;
}
async function postToConnection(endpoint, connectionId, data) {
  try {
    await getClient(endpoint).send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data))
      })
    );
    return true;
  } catch (err) {
    const statusCode = err.statusCode;
    if (statusCode === 410) {
      await deleteConnection(connectionId);
      return false;
    }
    console.error("Error posting to connection", connectionId, err);
    return false;
  }
}
var POST_CONCURRENCY = 10;
async function postToMany(targets, data) {
  for (let i = 0; i < targets.length; i += POST_CONCURRENCY) {
    const batch = targets.slice(i, i + POST_CONCURRENCY);
    await Promise.all(
      batch.map((t) => postToConnection(t.endpoint, t.connectionId, data))
    );
  }
}

// lib/wsPresence.ts
var REGION3 = "us-east-1";
var ddbLow = new DynamoDBClient3({ region: REGION3 });
var ddbDoc = DynamoDBDocumentClient3.from(ddbLow, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var sqs = new SQSClient({ region: REGION3 });
var PRESENCE_PK = "wsMeta";
var PRESENCE_SK = "presenceSeq";
async function incrementPresenceSeq() {
  const result = await ddbLow.send(
    new UpdateItemCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: { S: PRESENCE_PK },
        sk: { S: PRESENCE_SK }
      },
      UpdateExpression: "ADD #seq :one",
      ExpressionAttributeNames: { "#seq": "seq" },
      ExpressionAttributeValues: { ":one": { N: "1" } },
      ReturnValues: "UPDATED_NEW"
    })
  );
  const raw = result.Attributes?.seq?.N;
  return raw ? parseInt(raw, 10) : 1;
}
async function broadcastPresenceDelta(joins, leaves) {
  if (joins.length === 0 && leaves.length === 0) {
    return;
  }
  const seq = await incrementPresenceSeq();
  const payload = { type: "delta", seq, joins, leaves };
  const connections = await listAllConnections();
  const now = Math.floor(Date.now() / 1e3);
  const targets = [];
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
function mergePresenceBatch(events) {
  const joinSet = /* @__PURE__ */ new Set();
  const leaveSet = /* @__PURE__ */ new Set();
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
    leaves: [...leaveSet]
  };
}

// api/sockets/presenceBroadcaster.ts
var handler = async (event) => {
  const events = [];
  for (const record of event.Records) {
    const ev = parseRecord(record);
    if (ev) {
      events.push(ev);
    }
  }
  const { joins, leaves } = mergePresenceBatch(events);
  await broadcastPresenceDelta(joins, leaves);
  return { statusCode: 200 };
};
function parseRecord(record) {
  try {
    const body = JSON.parse(record.body);
    if ((body.type === "join" || body.type === "leave") && typeof body.userId === "string") {
      return body;
    }
  } catch {
    console.error("Invalid presence coalesce message", record.body);
  }
  return null;
}
export {
  handler
};
