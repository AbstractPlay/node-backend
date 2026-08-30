// api/sockets/watchGamesHandler.ts
import { DynamoDBClient as DynamoDBClient2 } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient as DynamoDBDocumentClient2, UpdateCommand } from "@aws-sdk/lib-dynamodb";

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
var WS_CONNECTION_TTL_SEC = 86400;
function gameWatchKey(meta, id) {
  return `${meta}#${id}`;
}
function watchingGamesFromRefs(games) {
  const watchingGames = /* @__PURE__ */ new Set();
  if (!Array.isArray(games)) {
    return watchingGames;
  }
  for (const g of games) {
    if (g?.meta && g?.id) {
      watchingGames.add(gameWatchKey(g.meta, g.id));
    }
  }
  return watchingGames;
}
function connectionTtl() {
  return Math.floor(Date.now() / 1e3) + WS_CONNECTION_TTL_SEC;
}
async function getConnection(connectionId) {
  const result = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId }
    })
  );
  return result.Item;
}

// api/sockets/watchGamesHandler.ts
var REGION2 = "us-east-1";
var clnt2 = new DynamoDBClient2({ region: REGION2 });
var ddbDocClient2 = DynamoDBDocumentClient2.from(clnt2, {
  marshallOptions: { convertEmptyValues: false, removeUndefinedValues: true }
});
var handler = async (event) => {
  const { connectionId } = event.requestContext;
  const body = JSON.parse(event.body ?? "{}");
  const games = Array.isArray(body.games) ? body.games : [];
  const existing = await getConnection(connectionId);
  if (!existing) {
    return { statusCode: 403, body: "Not subscribed" };
  }
  const watchingGames = watchingGamesFromRefs(games);
  const updateExpr = watchingGames.size > 0 ? "SET watchingGames = :wg, #ttl = :ttl, watchVersion = :wv" : "REMOVE watchingGames SET #ttl = :ttl, watchVersion = :wv";
  const values = {
    ":ttl": connectionTtl(),
    ":wv": 1
  };
  if (watchingGames.size > 0) {
    values[":wg"] = watchingGames;
  }
  await ddbDocClient2.send(
    new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "wsConnections", sk: connectionId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: values
    })
  );
  return { statusCode: 200 };
};
export {
  handler
};
