// lib/wsConnectionStore.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
var REGION = "us-east-1";
var clnt = new DynamoDBClient({ region: REGION });
var ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false }
});
function gameWatchKey(meta, id) {
  return `${meta}#${id}`;
}
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
    const result = await ddbDocClient.send(new QueryCommand(params));
    for (const item of result.Items ?? []) {
      items.push(item);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
async function deleteConnection(connectionId) {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
}
function watchingGamesHas(conn, gameKey) {
  if (!conn.watchingGames) {
    return false;
  }
  if (conn.watchingGames instanceof Set) {
    return conn.watchingGames.has(gameKey);
  }
  return Array.isArray(conn.watchingGames) && conn.watchingGames.includes(gameKey);
}
function usesStrictGameWatch(conn) {
  return conn.watchVersion === 1;
}
function isLegacyGameFanout(conn) {
  return conn.watchVersion !== 1 && conn.watchingGames === void 0;
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

// api/sockets/messageHandler.ts
var handler = async (event) => {
  for (const record of event.Records) {
    await processRecord(record);
  }
  return { statusCode: 200 };
};
async function processRecord(record) {
  let body;
  try {
    body = JSON.parse(record.body);
  } catch {
    console.error("Invalid SQS message JSON", record.body);
    return;
  }
  const { verb, payload, exclude } = body;
  if (!["chat", "game", "test", "connections"].includes(verb)) {
    console.warn("Unsupported verb:", verb);
    return;
  }
  const connections = await listAllConnections();
  const now = Math.floor(Date.now() / 1e3);
  const targets = [];
  for (const conn of connections) {
    if (conn.ttl && conn.ttl < now) {
      await deleteConnection(conn.sk);
      continue;
    }
    if (exclude?.includes(conn.userId)) {
      continue;
    }
    if (!shouldDeliver(verb, conn, payload)) {
      continue;
    }
    targets.push({ endpoint: conn.endpoint, connectionId: conn.sk });
  }
  await postToMany(targets, { verb, payload });
}
function shouldDeliver(verb, conn, payload) {
  if (verb === "game" || verb === "chat") {
    const meta = payload?.meta;
    const id = payload?.id;
    if (!meta || !id) {
      return false;
    }
    const key = gameWatchKey(meta, id);
    if (isLegacyGameFanout(conn)) {
      return true;
    }
    if (usesStrictGameWatch(conn)) {
      return watchingGamesHas(conn, key);
    }
    return watchingGamesHas(conn, key);
  }
  if (verb === "connections") {
    if (payload?.type === "delta" || payload?.type === "snapshot") {
      return wantsPresenceUpdates(conn);
    }
    return wantsPresenceUpdates(conn);
  }
  return true;
}
export {
  handler
};
