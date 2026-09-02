import { GameFactory } from '@abstractplay/gameslib';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { gameRecordSk, isGameParticipant, type GameForCommentAuth } from './commentAuth.js';
import { decompressGameState } from './gameState.js';
import { shouldKeepCompletedGame, type GameRecord } from './gameProjector.js';

export type GameMarkPlayer = { id: string; name: string; time?: number };

export type GameMarkSummary = {
  id: string;
  metaGame: string;
  players: GameMarkPlayer[];
  lastMoveTime: number;
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  seen?: number;
  winner?: number[];
  numMoves?: number;
  gameStarted?: number;
  gameEnded?: number;
  lastChat?: number;
  variants?: string[];
  commented?: number;
};

export type RepresentativeEntry = GameMarkSummary & {
  userId: string;
  userName: string;
  addedAt: number;
};

export type HighlightEntry = GameMarkSummary & {
  addedAt: number;
};

export type MarkResult =
  | { ok: true }
  | { ok: false; message: string };

export type GameMarkSource = {
  id: string;
  metaGame: string;
  players: GameMarkPlayer[];
  clockHard: boolean;
  noExplore?: boolean;
  toMove: string | boolean[];
  lastMoveTime: number;
  gameStarted?: number;
  gameEnded?: number;
  winner?: number[];
  numMoves?: number;
  numPlayers: number;
  state?: string;
  commented?: number;
  variants?: string[];
};

export type LoadedGameForMark = {
  game: GameMarkSource;
  cbit: 0 | 1;
};

const MAX_RECOMMENDATIONS_PER_METAGAME = 2;

function isCompletedToMove(toMove: string | boolean[] | undefined | null): boolean {
  return toMove === '' || toMove === null || toMove === undefined;
}

async function queryAllItems(
  client: DynamoDBDocumentClient,
  params: QueryCommandInput,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      ...params,
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function getGameRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  cbit: 0 | 1,
): Promise<GameMarkSource | undefined> {
  const data = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: 'GAME',
        sk: gameRecordSk(metaGame, cbit, gameId),
      },
    }),
  );
  if (data.Item === undefined) {
    return undefined;
  }
  const game = data.Item as GameMarkSource;
  if (!Array.isArray(game.players)) {
    game.players = [];
  }
  return game;
}

export async function loadGameForMark(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  preferCompleted = false,
): Promise<LoadedGameForMark | undefined> {
  if (preferCompleted) {
    const completed = await getGameRecord(client, tableName, metaGame, gameId, 1);
    if (completed !== undefined) {
      return { game: completed, cbit: 1 };
    }
    return undefined;
  }
  const active = await getGameRecord(client, tableName, metaGame, gameId, 0);
  if (active !== undefined) {
    return { game: active, cbit: 0 };
  }
  const completed = await getGameRecord(client, tableName, metaGame, gameId, 1);
  if (completed !== undefined) {
    return { game: completed, cbit: 1 };
  }
  return undefined;
}

function applyEngineToSummary(
  source: GameMarkSource,
  summary: GameMarkSummary,
  completed: boolean,
): void {
  if (!source.state) {
    return;
  }
  try {
    const stateStr = decompressGameState(source.state);
    const engine = GameFactory(source.metaGame, stateStr);
    if (!engine) {
      return;
    }
    const lastTs = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
    if (summary.numMoves === undefined) {
      summary.numMoves = engine.stack.length - 1;
    }
    if (summary.gameStarted === undefined) {
      summary.gameStarted = new Date(engine.stack[0]._timestamp).getTime();
    }
    if (summary.variants === undefined) {
      summary.variants = engine.variants;
    }
    if (completed && summary.gameEnded === undefined) {
      summary.gameEnded = lastTs;
    }
    if (engine.gameover) {
      if (summary.gameEnded === undefined) {
        summary.gameEnded = lastTs;
      }
      if (summary.winner === undefined) {
        summary.winner = engine.winner;
      }
    }
  } catch {
    // leave derived fields unset; caller may apply fallbacks
  }
}

export function buildGameSummary(source: GameMarkSource): GameMarkSummary {
  const summary: GameMarkSummary = {
    id: source.id,
    metaGame: source.metaGame,
    players: source.players,
    clockHard: source.clockHard,
    noExplore: source.noExplore ?? false,
    lastMoveTime: source.lastMoveTime,
  };
  if (source.gameStarted !== undefined) {
    summary.gameStarted = source.gameStarted;
  }
  if (source.gameEnded !== undefined) {
    summary.gameEnded = source.gameEnded;
  }
  if (source.winner !== undefined) {
    summary.winner = source.winner;
  }
  if (source.variants !== undefined) {
    summary.variants = source.variants;
  }
  if (source.commented !== undefined) {
    summary.commented = source.commented;
  }
  const completed = isCompletedToMove(source.toMove);
  if (!completed) {
    summary.toMove = source.toMove;
  }

  if (source.numMoves !== undefined) {
    summary.numMoves = source.numMoves;
  }

  const needsEngine =
    summary.numMoves === undefined
    || summary.gameStarted === undefined
    || summary.variants === undefined
    || (completed && summary.gameEnded === undefined)
    || (completed && summary.winner === undefined);

  if (needsEngine) {
    applyEngineToSummary(source, summary, completed);
  }

  if (completed && summary.gameEnded === undefined) {
    summary.gameEnded = source.lastMoveTime;
  }

  return summary;
}

function gameAsRecord(source: GameMarkSource): GameRecord {
  return {
    pk: 'GAME',
    sk: gameRecordSk(source.metaGame, isCompletedToMove(source.toMove) ? 1 : 0, source.id),
    id: source.id,
    metaGame: source.metaGame,
    numPlayers: source.numPlayers,
    players: source.players,
    clockHard: source.clockHard,
    noExplore: source.noExplore,
    toMove: source.toMove,
    lastMoveTime: source.lastMoveTime,
    gameStarted: source.gameStarted,
    gameEnded: source.gameEnded,
    winner: source.winner,
    numMoves: source.numMoves,
    variants: source.variants,
    commented: source.commented,
    state: source.state ?? '',
  };
}

export function isQualityCompletedGame(source: GameMarkSource, summary: GameMarkSummary): boolean {
  const numMoves = summary.numMoves ?? 0;
  return shouldKeepCompletedGame(gameAsRecord(source), numMoves);
}

async function getUserName(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<string> {
  const user = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
    }),
  );
  if (user.Item?.name && typeof user.Item.name === 'string') {
    return user.Item.name;
  }
  const users = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USERS', sk: userId },
    }),
  );
  if (users.Item?.name && typeof users.Item.name === 'string') {
    return users.Item.name;
  }
  return userId;
}

function representativeUserSk(metaGame: string, gameId: string): string {
  return `REPRESENTATIVE#${metaGame}#${gameId}`;
}

function representativeMetaSk(userId: string, gameId: string): string {
  return `${userId}#${gameId}`;
}

export async function watchGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<MarkResult> {
  const loaded = await loadGameForMark(client, tableName, metaGame, gameId);
  if (loaded === undefined) {
    return { ok: false, message: 'Game not found.' };
  }
  const authGame: GameForCommentAuth = { players: loaded.game.players };
  if (isGameParticipant(authGame, userId)) {
    return { ok: false, message: 'Participants cannot watch their own games.' };
  }
  const summary = buildGameSummary(loaded.game);
  const now = Date.now();
  await Promise.all([
    client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `WATCHED#${userId}`,
        sk: gameId,
        ...summary,
        addedAt: now,
      },
    })),
    client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `GAMEWATCHERS#${gameId}`,
        sk: userId,
      },
    })),
  ]);
  return { ok: true };
}

export async function unwatchGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<MarkResult> {
  await Promise.all([
    client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `WATCHED#${userId}`, sk: gameId },
    })),
    client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `GAMEWATCHERS#${gameId}`, sk: userId },
    })),
  ]);
  return { ok: true };
}

export async function listWatchedGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<GameMarkSummary[]> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `WATCHED#${userId}` },
  });
  return items.map(item => item as GameMarkSummary);
}

export async function highlightGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<MarkResult> {
  const loaded = await loadGameForMark(client, tableName, metaGame, gameId);
  if (loaded === undefined) {
    return { ok: false, message: 'Game not found.' };
  }
  const authGame: GameForCommentAuth = { players: loaded.game.players };
  if (!isGameParticipant(authGame, userId)) {
    return { ok: false, message: 'Only participants can highlight a game.' };
  }
  const summary = buildGameSummary(loaded.game);
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: `HIGHLIGHT#${userId}`,
      sk: `${metaGame}#${gameId}`,
      addedAt: Date.now(),
      ...summary,
    },
  }));
  return { ok: true };
}

export async function unhighlightGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<MarkResult> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: `HIGHLIGHT#${userId}`, sk: `${metaGame}#${gameId}` },
  }));
  return { ok: true };
}

export async function listHighlights(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<HighlightEntry[]> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `HIGHLIGHT#${userId}` },
  });
  return items
    .map(item => item as HighlightEntry)
    .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}

export async function countUserRecommendationsForMetaGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
): Promise<number> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: {
      ':pk': `PLAYER#${userId}`,
      ':prefix': `REPRESENTATIVE#${metaGame}#`,
    },
  });
  return items.length;
}

export async function recommendGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<MarkResult> {
  const loaded = await loadGameForMark(client, tableName, metaGame, gameId, true);
  if (loaded === undefined || loaded.cbit !== 1) {
    return { ok: false, message: 'Only completed games can be recommended.' };
  }
  if (loaded.game.metaGame !== metaGame) {
    return { ok: false, message: 'metaGame does not match the game.' };
  }
  if (!isCompletedToMove(loaded.game.toMove)) {
    return { ok: false, message: 'Only completed games can be recommended.' };
  }
  const summary = buildGameSummary(loaded.game);
  if (!isQualityCompletedGame(loaded.game, summary)) {
    return { ok: false, message: 'This game is too short to recommend.' };
  }

  const existingSk = representativeUserSk(metaGame, gameId);
  const existing = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `PLAYER#${userId}`, sk: existingSk },
  }));
  if (existing.Item !== undefined) {
    return { ok: true };
  }

  const count = await countUserRecommendationsForMetaGame(client, tableName, userId, metaGame);
  if (count >= MAX_RECOMMENDATIONS_PER_METAGAME) {
    return {
      ok: false,
      message: `You can only recommend ${MAX_RECOMMENDATIONS_PER_METAGAME} games per metaGame.`,
    };
  }

  const userName = await getUserName(client, tableName, userId);
  const addedAt = Date.now();
  const repItem = {
    userId,
    userName,
    addedAt,
    ...summary,
  };

  await Promise.all([
    client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `REPRESENTATIVE#${metaGame}`,
        sk: representativeMetaSk(userId, gameId),
        ...repItem,
      },
    })),
    client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `PLAYER#${userId}`,
        sk: existingSk,
        addedAt,
        ...summary,
      },
    })),
  ]);
  return { ok: true };
}

export async function unrecommendGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  metaGame: string,
  gameId: string,
): Promise<MarkResult> {
  await Promise.all([
    client.send(new DeleteCommand({
      TableName: tableName,
      Key: {
        pk: `REPRESENTATIVE#${metaGame}`,
        sk: representativeMetaSk(userId, gameId),
      },
    })),
    client.send(new DeleteCommand({
      TableName: tableName,
      Key: {
        pk: `PLAYER#${userId}`,
        sk: representativeUserSk(metaGame, gameId),
      },
    })),
  ]);
  return { ok: true };
}

export async function listUserRecommendations(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<RepresentativeEntry[]> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: {
      ':pk': `PLAYER#${userId}`,
      ':prefix': 'REPRESENTATIVE#',
    },
  });
  return items
    .map(item => {
      const sk = item.sk as string;
      const parts = sk.split('#');
      const meta = parts[1] ?? '';
      const entry = item as RepresentativeEntry;
      if (!entry.userId) {
        entry.userId = userId;
      }
      if (!entry.metaGame && meta) {
        entry.metaGame = meta;
      }
      return entry;
    })
    .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}

export async function listMetaGameRecommendations(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
): Promise<RepresentativeEntry[]> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `REPRESENTATIVE#${metaGame}` },
  });
  return items
    .map(item => item as RepresentativeEntry)
    .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}

export async function countGameWatchers(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
): Promise<number> {
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `GAMEWATCHERS#${gameId}` },
      Select: 'COUNT',
      ExclusiveStartKey: lastKey,
    }));
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

export async function updateWatcherSummaries(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  summary: GameMarkSummary,
): Promise<void> {
  const watchers = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `GAMEWATCHERS#${gameId}` },
    ProjectionExpression: 'sk',
  });
  if (watchers.length === 0) {
    return;
  }
  const updates = watchers.map(async watcher => {
    const watcherId = watcher.sk as string;
    const existing = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: `WATCHED#${watcherId}`, sk: gameId },
    }));
    const prev = existing.Item ?? {};
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `WATCHED#${watcherId}`,
        sk: gameId,
        ...summary,
        addedAt: prev.addedAt ?? Date.now(),
        seen: prev.seen,
        lastChat: prev.lastChat,
      },
    }));
  });
  await Promise.all(updates);
}

export async function updateLastChatForWatchers(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  currentUserId: string,
): Promise<void> {
  const watchers = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `GAMEWATCHERS#${gameId}` },
    ProjectionExpression: 'sk',
  });
  if (watchers.length === 0) {
    return;
  }
  const now = Date.now();
  const updates = watchers.map(watcher => {
    const watcherId = watcher.sk as string;
    const isCommenter = watcherId === currentUserId;
    if (isCommenter) {
      return client.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: `WATCHED#${watcherId}`, sk: gameId },
        UpdateExpression: 'SET lastChat = :lc, seen = :seen',
        ExpressionAttributeValues: {
          ':lc': now,
          ':seen': now + 10,
        },
      }));
    }
    return client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `WATCHED#${watcherId}`, sk: gameId },
      UpdateExpression: 'SET lastChat = :lc',
      ExpressionAttributeValues: { ':lc': now },
    }));
  });
  await Promise.all(updates);
}

export async function setWatchedSeen(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
  seen: number,
  lastChat?: number,
): Promise<boolean> {
  const watched = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `WATCHED#${userId}`, sk: gameId },
  }));
  if (watched.Item === undefined) {
    return false;
  }
  const values: Record<string, number> = { ':seen': seen };
  let updateExpression = 'SET seen = :seen';
  if (lastChat !== undefined) {
    values[':lc'] = lastChat;
    updateExpression += ', lastChat = :lc';
  }
  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `WATCHED#${userId}`, sk: gameId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: values,
  }));
  return true;
}
