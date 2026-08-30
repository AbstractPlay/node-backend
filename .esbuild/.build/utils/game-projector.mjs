// lib/ddb.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
var REGION = "us-east-1";
var clnt = new DynamoDBClient({ region: REGION });
var ddbDocClient = DynamoDBDocumentClient.from(clnt, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

// lib/gameProjector.ts
import {
  BatchWriteCommand,
  DeleteCommand as DeleteCommand2,
  PutCommand,
  UpdateCommand as UpdateCommand2
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { GameFactory } from "@abstractplay/gameslib";

// lib/gameState.ts
import { gzipSync, gunzipSync } from "zlib";
var COMPRESSED_PREFIX = "gz:";
function isGzipBuffer(buf) {
  return buf.length >= 2 && buf[0] === 31 && buf[1] === 139;
}
function gunzipBase64(base64) {
  return gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
}
function decompressGameState(state) {
  if (!state || state.startsWith("{") || state.startsWith("[")) {
    return state;
  }
  if (state.startsWith(COMPRESSED_PREFIX)) {
    return gunzipBase64(state.slice(COMPRESSED_PREFIX.length));
  }
  try {
    const buf = Buffer.from(state, "base64");
    if (isGzipBuffer(buf)) {
      return gunzipSync(buf).toString("utf8");
    }
  } catch {
  }
  return state;
}

// lib/participants.ts
import { GetCommand } from "@aws-sdk/lib-dynamodb";
async function getBotRecord(clientId) {
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: "BOT", sk: clientId }
    })
  );
  return data.Item;
}
async function isBotId(id) {
  const bot = await getBotRecord(id);
  return bot !== void 0;
}

// lib/userGameOverlay.ts
import {
  DeleteCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
async function deleteUserGameOverlay(client, tableName, userId, gameId) {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: `USERGAME#${userId}`, sk: gameId }
  }));
}

// lib/gameProjector.ts
function parseGameSk(sk) {
  const parts = sk.split("#");
  if (parts.length !== 3) {
    return null;
  }
  const [metaGame, cbit, gameId] = parts;
  if (!metaGame || !cbit || !gameId) {
    return null;
  }
  return { metaGame, cbit, gameId };
}
function toCurrentSummary(game) {
  return {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
    variants: game.variants,
    gameStarted: game.gameStarted,
    numMoves: resolveNumMoves(game)
  };
}
function toCompletedSummary(game, numMoves) {
  return {
    id: game.id,
    metaGame: game.metaGame,
    players: game.players,
    clockHard: game.clockHard,
    noExplore: game.noExplore ?? false,
    lastMoveTime: game.lastMoveTime,
    numMoves,
    gameStarted: game.gameStarted,
    gameEnded: game.gameEnded,
    winner: game.winner,
    variants: game.variants,
    commented: game.commented,
    toMove: game.toMove
  };
}
function resolveNumMoves(game) {
  if (game.numMoves !== void 0) {
    return game.numMoves;
  }
  try {
    const state = decompressGameState(game.state);
    const engine = GameFactory(game.metaGame, state);
    if (engine) {
      return engine.stack.length - 1;
    }
  } catch (error) {
    console.warn(`resolveNumMoves failed for game ${game.id}:`, error);
  }
  return 0;
}
function shouldKeepCompletedGame(game, numMoves) {
  if (game.numPlayers === 1) {
    return numMoves > 0;
  }
  return numMoves > game.numPlayers;
}
function unmarshallImage(image) {
  if (!image || typeof image !== "object") {
    return void 0;
  }
  return unmarshall(image);
}
async function humanPlayerIds(players) {
  const ids = [];
  for (const player of players) {
    if (!await isBotId(player.id)) {
      ids.push(player.id);
    }
  }
  return ids;
}
async function ensureShardedMetaGameCountEntry(docClient, tableName, metaGame) {
  await docClient.send(new UpdateCommand2({
    TableName: tableName,
    Key: { pk: `METAGAMES#${metaGame}`, sk: "COUNTS" },
    UpdateExpression: [
      "SET currentgames = if_not_exists(currentgames, :z)",
      "completedgames = if_not_exists(completedgames, :z)",
      "standingchallenges = if_not_exists(standingchallenges, :z)",
      "stars = if_not_exists(stars, :z)",
      "ratingsCount = if_not_exists(ratingsCount, :z)"
    ].join(", "),
    ExpressionAttributeValues: { ":z": 0 }
  }));
}
async function ensureShardedMetaGameCounts(docClient, tableName, metaGame) {
  await ensureShardedMetaGameCountEntry(docClient, tableName, metaGame);
}
async function adjustShardedCounts(docClient, tableName, metaGame, deltas) {
  await ensureShardedMetaGameCounts(docClient, tableName, metaGame);
  const parts = [];
  const values = { ":z": 0 };
  if (deltas.currentgames !== void 0) {
    parts.push("currentgames = if_not_exists(currentgames, :z) + :cg");
    values[":cg"] = deltas.currentgames;
  }
  if (deltas.completedgames !== void 0) {
    parts.push("completedgames = if_not_exists(completedgames, :z) + :cd");
    values[":cd"] = deltas.completedgames;
  }
  if (deltas.standingchallenges !== void 0) {
    parts.push("standingchallenges = if_not_exists(standingchallenges, :z) + :sc");
    values[":sc"] = deltas.standingchallenges;
  }
  if (deltas.stars !== void 0) {
    parts.push("stars = if_not_exists(stars, :z) + :st");
    values[":st"] = deltas.stars;
  }
  if (deltas.ratingsCount !== void 0) {
    parts.push("ratingsCount = if_not_exists(ratingsCount, :z) + :rc");
    values[":rc"] = deltas.ratingsCount;
  }
  if (parts.length === 0) {
    return;
  }
  await docClient.send(new UpdateCommand2({
    TableName: tableName,
    Key: { pk: `METAGAMES#${metaGame}`, sk: "COUNTS" },
    UpdateExpression: `SET ${parts.join(", ")}`,
    ExpressionAttributeValues: values
  }));
}
async function putCurrentGamesForPlayers(docClient, tableName, game, playerIds) {
  const summary = toCurrentSummary(game);
  await Promise.all(playerIds.map(
    (playerId) => docClient.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `CURRENTGAMES#${playerId}`,
        sk: game.id,
        ...summary
      }
    }))
  ));
}
async function deleteCurrentGamesForPlayers(docClient, tableName, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => docClient.send(new DeleteCommand2({
      TableName: tableName,
      Key: { pk: `CURRENTGAMES#${playerId}`, sk: gameId }
    }))
  ));
}
async function deleteRecentCompletedForPlayers(docClient, tableName, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => docClient.send(new DeleteCommand2({
      TableName: tableName,
      Key: { pk: `RECENTCOMPLETED#${playerId}`, sk: gameId }
    }))
  ));
}
async function deleteUserGameOverlaysForPlayers(docClient, tableName, gameId, playerIds) {
  await Promise.all(playerIds.map(
    (playerId) => deleteUserGameOverlay(docClient, tableName, playerId, gameId)
  ));
}
async function putCompletedGameIndexes(docClient, tableName, game, summary) {
  const sk = `${game.lastMoveTime}#${game.id}`;
  const work = [
    docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `COMPLETEDGAMES#${game.metaGame}`, sk, ...summary }
    }))
  ];
  for (const player of game.players) {
    work.push(docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `COMPLETEDGAMES#${player.id}`, sk, ...summary }
    })));
  }
  await Promise.all(work);
}
async function deleteCompletedGameIndexes(docClient, tableName, game) {
  const sk = `${game.lastMoveTime}#${game.id}`;
  const keys = [
    { pk: `COMPLETEDGAMES#${game.metaGame}`, sk },
    ...game.players.map((p) => ({ pk: `COMPLETEDGAMES#${p.id}`, sk }))
  ];
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((key) => ({
          DeleteRequest: { Key: key }
        }))
      }
    }));
  }
}
async function handleActiveGameInsert(docClient, tableName, game) {
  const playerIds = await humanPlayerIds(game.players);
  await putCurrentGamesForPlayers(docClient, tableName, game, playerIds);
  await adjustShardedCounts(docClient, tableName, game.metaGame, { currentgames: 1 });
}
async function handleActiveGameModify(docClient, tableName, game) {
  const playerIds = await humanPlayerIds(game.players);
  await putCurrentGamesForPlayers(docClient, tableName, game, playerIds);
}
async function handleActiveGameRemove(docClient, tableName, game) {
  const playerIds = await humanPlayerIds(game.players);
  await deleteCurrentGamesForPlayers(docClient, tableName, game.id, playerIds);
}
async function handleCompletedGameInsert(docClient, tableName, game) {
  const numMoves = resolveNumMoves(game);
  const keepgame = shouldKeepCompletedGame(game, numMoves);
  const playerIds = await humanPlayerIds(game.players);
  if (keepgame) {
    const summary = toCompletedSummary(game, numMoves);
    await putCompletedGameIndexes(docClient, tableName, game, summary);
  } else {
    await deleteUserGameOverlaysForPlayers(docClient, tableName, game.id, playerIds);
  }
  const deltas = { currentgames: -1 };
  if (keepgame) {
    deltas.completedgames = 1;
  }
  await adjustShardedCounts(docClient, tableName, game.metaGame, deltas);
}
async function handleCompletedGameModify(docClient, tableName, game, oldGame) {
  if (oldGame?.commented === game.commented) {
    return;
  }
  const numMoves = resolveNumMoves(game);
  if (!shouldKeepCompletedGame(game, numMoves)) {
    return;
  }
  const summary = toCompletedSummary(game, numMoves);
  await putCompletedGameIndexes(docClient, tableName, game, summary);
}
async function handleCompletedGameRemove(docClient, tableName, game) {
  const playerIds = await humanPlayerIds(game.players);
  await deleteCompletedGameIndexes(docClient, tableName, game);
  await deleteRecentCompletedForPlayers(docClient, tableName, game.id, playerIds);
  const numMoves = resolveNumMoves(game);
  if (shouldKeepCompletedGame(game, numMoves)) {
    await adjustShardedCounts(docClient, tableName, game.metaGame, {
      completedgames: -1
    });
  }
}
async function processGameStreamRecord(docClient, tableName, record) {
  const eventName = record.eventName;
  if (!eventName) {
    return;
  }
  if ((eventName === "INSERT" || eventName === "MODIFY") && !record.dynamodb?.NewImage) {
    return;
  }
  if (eventName === "REMOVE" && !record.dynamodb?.OldImage) {
    return;
  }
  const newGame = unmarshallImage(record.dynamodb?.NewImage);
  const oldGame = unmarshallImage(record.dynamodb?.OldImage);
  const game = newGame ?? oldGame;
  if (!game || game.pk !== "GAME") {
    return;
  }
  const parsed = parseGameSk(game.sk);
  if (!parsed) {
    return;
  }
  const { cbit } = parsed;
  if (cbit === "0") {
    if (eventName === "INSERT" && newGame) {
      await handleActiveGameInsert(docClient, tableName, newGame);
    } else if (eventName === "MODIFY" && newGame) {
      await handleActiveGameModify(docClient, tableName, newGame);
    } else if (eventName === "REMOVE" && oldGame) {
      await handleActiveGameRemove(docClient, tableName, oldGame);
    }
    return;
  }
  if (cbit === "1") {
    if (eventName === "INSERT" && newGame) {
      await handleCompletedGameInsert(docClient, tableName, newGame);
    } else if (eventName === "MODIFY" && newGame) {
      await handleCompletedGameModify(docClient, tableName, newGame, oldGame);
    } else if (eventName === "REMOVE" && oldGame) {
      await handleCompletedGameRemove(docClient, tableName, oldGame);
    }
  }
}

// utils/game-projector.ts
var handler = async (event) => {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error("ABSTRACT_PLAY_TABLE is not set");
  }
  for (const record of event.Records) {
    await processGameStreamRecord(ddbDocClient, tableName, record);
  }
};
export {
  handler
};
