// api/sockets/syncPresenceHandler.ts
import { DynamoDBClient as DynamoDBClient4 } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient5 } from "@aws-sdk/lib-dynamodb";

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
async function getConnection(connectionId) {
  const result = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
  return result.Item;
}
async function deleteConnection(connectionId) {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
}

// lib/wsPresence.ts
import { DynamoDBClient as DynamoDBClient3, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient3, GetCommand as GetCommand2 } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// lib/getConnections.ts
import { DynamoDBDocumentClient as DynamoDBDocumentClient2, QueryCommand as QueryCommand2 } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";
var REGION2 = "us-east-1";
var clnt2 = new DynamoDBClient2({ region: REGION2 });
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
var ddbDocClient2 = DynamoDBDocumentClient2.from(clnt2, translateConfig);
async function getConnections(consistent = false) {
  const allUsers = /* @__PURE__ */ new Set();
  const visibleUsers = /* @__PURE__ */ new Set();
  let lastKey = void 0;
  do {
    const params = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
        ":pk": "wsConnections"
      },
      // Only fetch what we need
      ProjectionExpression: "userId, invisible",
      ExclusiveStartKey: lastKey,
      ConsistentRead: consistent
    };
    const result = await ddbDocClient2.send(new QueryCommand2(params));
    const items = result.Items ?? [];
    for (const item of items) {
      allUsers.add(item.userId);
      if (item.invisible !== true) {
        if (item.userId) {
          visibleUsers.add(item.userId);
        }
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return { totalCount: allUsers.size, visibleUserIds: [...visibleUsers] };
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

// lib/wsPresence.ts
var REGION3 = "us-east-1";
var ddbLow = new DynamoDBClient3({ region: REGION3 });
var ddbDoc = DynamoDBDocumentClient3.from(ddbLow, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var sqs = new SQSClient({ region: REGION3 });
var PRESENCE_PK = "wsMeta";
var PRESENCE_SK = "presenceSeq";
async function getPresenceSeq() {
  const result = await ddbDoc.send(
    new GetCommand2({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: PRESENCE_PK, sk: PRESENCE_SK }
    })
  );
  const seq = result.Item?.seq;
  return typeof seq === "number" ? seq : 0;
}
async function buildPresenceSnapshot() {
  const [conns, seq] = await Promise.all([getConnections(), getPresenceSeq()]);
  return {
    type: "snapshot",
    seq,
    totalCount: conns.totalCount,
    visibleUserIds: conns.visibleUserIds
  };
}
async function sendPresenceSnapshot(endpoint, connectionId) {
  const snapshot = await buildPresenceSnapshot();
  await postToConnection(endpoint, connectionId, {
    verb: "connections",
    payload: snapshot
  });
}

// lib/touchUserLastSeen.ts
import {
  BatchGetCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
var TOUCH_USER_LAST_SEEN_INTERVAL_MS = 15 * 60 * 1e3;
function isConditionalFailure(err) {
  return typeof err === "object" && err !== null && "name" in err && err.name === "ConditionalCheckFailedException";
}
async function touchUserLastSeen(client, tableName, userId, now = Date.now()) {
  const touchBefore = now - TOUCH_USER_LAST_SEEN_INTERVAL_MS;
  try {
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "USERS", sk: userId },
      ConditionExpression: "attribute_not_exists(lastSeen) OR lastSeen < :touchBefore",
      UpdateExpression: "SET lastSeen = :now",
      ExpressionAttributeValues: {
        ":now": now,
        ":touchBefore": touchBefore
      }
    }));
    return true;
  } catch (err) {
    if (isConditionalFailure(err)) {
      return false;
    }
    throw err;
  }
}

// api/sockets/syncPresenceHandler.ts
var REGION4 = "us-east-1";
var clnt3 = new DynamoDBClient4({ region: REGION4 });
var ddbDocClient3 = DynamoDBDocumentClient5.from(clnt3, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var handler = async (event) => {
  const { connectionId } = event.requestContext;
  const conn = await getConnection(connectionId);
  if (!conn) {
    return { statusCode: 403, body: "Not subscribed" };
  }
  if (conn.userId) {
    await touchUserLastSeen(
      ddbDocClient3,
      process.env.ABSTRACT_PLAY_TABLE,
      conn.userId
    );
  }
  await sendPresenceSnapshot(conn.endpoint, connectionId);
  return { statusCode: 200 };
};
export {
  handler
};
