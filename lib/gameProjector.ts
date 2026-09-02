import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { GameFactory } from '@abstractplay/gameslib';
import type { DynamoDBRecord } from 'aws-lambda';
import { decompressGameState } from './gameState.js';
import { isBotId } from './participants.js';
import { deleteUserGameOverlay } from './userGameOverlay.js';

export type GameRecord = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  numPlayers: number;
  players: { id: string; name: string; time?: number }[];
  clockHard: boolean;
  noExplore?: boolean;
  toMove: string | boolean[];
  lastMoveTime: number;
  gameStarted?: number;
  gameEnded?: number;
  winner?: number[];
  numMoves?: number;
  variants?: string[];
  commented?: number;
  state: string;
};

export type GameSkParts = {
  metaGame: string;
  cbit: string;
  gameId: string;
};

export function parseGameSk(sk: string): GameSkParts | null {
  const parts = sk.split('#');
  if (parts.length !== 3) {
    return null;
  }
  const [metaGame, cbit, gameId] = parts;
  if (!metaGame || !cbit || !gameId) {
    return null;
  }
  return { metaGame, cbit, gameId };
}

export function toCurrentSummary(game: GameRecord) {
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
    numMoves: resolveNumMoves(game),
  };
}

export function toCompletedSummary(game: GameRecord, numMoves: number) {
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
    toMove: game.toMove,
  };
}

export function resolveNumMoves(game: GameRecord): number {
  if (game.numMoves !== undefined) {
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

export function shouldKeepCompletedGame(game: GameRecord, numMoves: number): boolean {
  if (game.numPlayers === 1) {
    return numMoves > 0;
  }
  return numMoves > game.numPlayers;
}

function unmarshallImage(image: unknown): GameRecord | undefined {
  if (!image || typeof image !== 'object') {
    return undefined;
  }
  return unmarshall(image as Parameters<typeof unmarshall>[0]) as GameRecord;
}

async function humanPlayerIds(players: { id: string }[]): Promise<string[]> {
  const ids: string[] = [];
  for (const player of players) {
    if (!(await isBotId(player.id))) {
      ids.push(player.id);
    }
  }
  return ids;
}

export type ShardedCountDeltas = {
  currentgames?: number;
  completedgames?: number;
  standingchallenges?: number;
  stars?: number;
  ratingsCount?: number;
};

export async function ensureShardedMetaGameCountEntry(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' },
    UpdateExpression: [
      'SET currentgames = if_not_exists(currentgames, :z)',
      'completedgames = if_not_exists(completedgames, :z)',
      'standingchallenges = if_not_exists(standingchallenges, :z)',
      'stars = if_not_exists(stars, :z)',
      'ratingsCount = if_not_exists(ratingsCount, :z)',
    ].join(', '),
    ExpressionAttributeValues: { ':z': 0 },
  }));
}

async function ensureShardedMetaGameCounts(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
): Promise<void> {
  await ensureShardedMetaGameCountEntry(docClient, tableName, metaGame);
}

export async function adjustShardedCounts(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  deltas: ShardedCountDeltas,
): Promise<void> {
  await ensureShardedMetaGameCounts(docClient, tableName, metaGame);
  const parts: string[] = [];
  const values: Record<string, number> = { ':z': 0 };
  if (deltas.currentgames !== undefined) {
    parts.push('currentgames = if_not_exists(currentgames, :z) + :cg');
    values[':cg'] = deltas.currentgames;
  }
  if (deltas.completedgames !== undefined) {
    parts.push('completedgames = if_not_exists(completedgames, :z) + :cd');
    values[':cd'] = deltas.completedgames;
  }
  if (deltas.standingchallenges !== undefined) {
    parts.push('standingchallenges = if_not_exists(standingchallenges, :z) + :sc');
    values[':sc'] = deltas.standingchallenges;
  }
  if (deltas.stars !== undefined) {
    parts.push('stars = if_not_exists(stars, :z) + :st');
    values[':st'] = deltas.stars;
  }
  if (deltas.ratingsCount !== undefined) {
    parts.push('ratingsCount = if_not_exists(ratingsCount, :z) + :rc');
    values[':rc'] = deltas.ratingsCount;
  }
  if (parts.length === 0) {
    return;
  }
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' },
    UpdateExpression: `SET ${parts.join(', ')}`,
    ExpressionAttributeValues: values,
  }));
}

async function putCurrentGamesForPlayers(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
  playerIds: string[],
): Promise<void> {
  const summary = toCurrentSummary(game);
  await Promise.all(playerIds.map(playerId =>
    docClient.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: `CURRENTGAMES#${playerId}`,
        sk: game.id,
        ...summary,
      },
    }))
  ));
}

async function deleteCurrentGamesForPlayers(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  playerIds: string[],
): Promise<void> {
  await Promise.all(playerIds.map(playerId =>
    docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `CURRENTGAMES#${playerId}`, sk: gameId },
    }))
  ));
}

async function deleteRecentCompletedForPlayers(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  playerIds: string[],
): Promise<void> {
  await Promise.all(playerIds.map(playerId =>
    docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `RECENTCOMPLETED#${playerId}`, sk: gameId },
    }))
  ));
}

/** Short completed games skip COMPLETEDGAMES# archive; overlays would otherwise orphan forever. */
async function deleteUserGameOverlaysForPlayers(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  playerIds: string[],
): Promise<void> {
  await Promise.all(playerIds.map(playerId =>
    deleteUserGameOverlay(docClient, tableName, playerId, gameId),
  ));
}

/** Admin hard-delete: active dashboard rows + currentgames count (stream REMOVE does not decrement). */
export async function purgeActiveGameDashboardIndexes(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
  playerIds: string[],
): Promise<void> {
  await deleteCurrentGamesForPlayers(docClient, tableName, game.id, playerIds);
  await deleteUserGameOverlaysForPlayers(docClient, tableName, game.id, playerIds);
  await adjustShardedCounts(docClient, tableName, game.metaGame, { currentgames: -1 });
}

/**
 * Admin hard-delete: completed dashboard rows without count adjustment.
 * Deleting the GAME record lets the stream projector decrement completedgames once.
 */
export async function purgeCompletedGameDashboardIndexes(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
  playerIds: string[],
): Promise<void> {
  await deleteCompletedGameIndexes(docClient, tableName, game);
  await deleteRecentCompletedForPlayers(docClient, tableName, game.id, playerIds);
  await deleteUserGameOverlaysForPlayers(docClient, tableName, game.id, playerIds);
}

async function putCompletedGameIndexes(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
  summary: ReturnType<typeof toCompletedSummary>,
): Promise<void> {
  const sk = `${game.lastMoveTime}#${game.id}`;
  const work: Promise<unknown>[] = [
    docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `COMPLETEDGAMES#${game.metaGame}`, sk, ...summary },
    })),
  ];
  for (const player of game.players) {
    work.push(docClient.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `COMPLETEDGAMES#${player.id}`, sk, ...summary },
    })));
  }
  await Promise.all(work);
}

async function deleteCompletedGameIndexes(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
): Promise<void> {
  const sk = `${game.lastMoveTime}#${game.id}`;
  const keys = [
    { pk: `COMPLETEDGAMES#${game.metaGame}`, sk },
    ...game.players.map(p => ({ pk: `COMPLETEDGAMES#${p.id}`, sk })),
  ];
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map(key => ({
          DeleteRequest: { Key: key },
        })),
      },
    }));
  }
}

async function handleActiveGameInsert(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
): Promise<void> {
  const playerIds = await humanPlayerIds(game.players);
  await putCurrentGamesForPlayers(docClient, tableName, game, playerIds);
  await adjustShardedCounts(docClient, tableName, game.metaGame, { currentgames: 1 });
}

async function handleActiveGameModify(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
): Promise<void> {
  const playerIds = await humanPlayerIds(game.players);
  await putCurrentGamesForPlayers(docClient, tableName, game, playerIds);
}

async function handleActiveGameRemove(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
): Promise<void> {
  const playerIds = await humanPlayerIds(game.players);
  await deleteCurrentGamesForPlayers(docClient, tableName, game.id, playerIds);
}

async function handleCompletedGameInsert(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
): Promise<void> {
  const numMoves = resolveNumMoves(game);
  const keepgame = shouldKeepCompletedGame(game, numMoves);
  const playerIds = await humanPlayerIds(game.players);
  if (keepgame) {
    const summary = toCompletedSummary(game, numMoves);
    await putCompletedGameIndexes(docClient, tableName, game, summary);
  } else {
    await deleteUserGameOverlaysForPlayers(docClient, tableName, game.id, playerIds);
  }
  const deltas: { currentgames: number; completedgames?: number } = { currentgames: -1 };
  if (keepgame) {
    deltas.completedgames = 1;
  }
  await adjustShardedCounts(docClient, tableName, game.metaGame, deltas);
}

async function handleCompletedGameModify(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
  oldGame: GameRecord | undefined,
): Promise<void> {
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

async function handleCompletedGameRemove(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  game: GameRecord,
): Promise<void> {
  const playerIds = await humanPlayerIds(game.players);
  await deleteCompletedGameIndexes(docClient, tableName, game);
  await deleteRecentCompletedForPlayers(docClient, tableName, game.id, playerIds);
  const numMoves = resolveNumMoves(game);
  if (shouldKeepCompletedGame(game, numMoves)) {
    await adjustShardedCounts(docClient, tableName, game.metaGame, {
      completedgames: -1,
    });
  }
}

export async function processGameStreamRecord(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  record: DynamoDBRecord,
): Promise<void> {
  const eventName = record.eventName;
  if (!eventName) {
    return;
  }
  if ((eventName === 'INSERT' || eventName === 'MODIFY') && !record.dynamodb?.NewImage) {
    return;
  }
  if (eventName === 'REMOVE' && !record.dynamodb?.OldImage) {
    return;
  }

  const newGame = unmarshallImage(record.dynamodb?.NewImage);
  const oldGame = unmarshallImage(record.dynamodb?.OldImage);
  const game = newGame ?? oldGame;
  if (!game || game.pk !== 'GAME') {
    return;
  }

  const parsed = parseGameSk(game.sk);
  if (!parsed) {
    return;
  }

  const { cbit } = parsed;

  if (cbit === '0') {
    if (eventName === 'INSERT' && newGame) {
      await handleActiveGameInsert(docClient, tableName, newGame);
    } else if (eventName === 'MODIFY' && newGame) {
      await handleActiveGameModify(docClient, tableName, newGame);
    } else if (eventName === 'REMOVE' && oldGame) {
      await handleActiveGameRemove(docClient, tableName, oldGame);
    }
    return;
  }

  if (cbit === '1') {
    if (eventName === 'INSERT' && newGame) {
      await handleCompletedGameInsert(docClient, tableName, newGame);
    } else if (eventName === 'MODIFY' && newGame) {
      await handleCompletedGameModify(docClient, tableName, newGame, oldGame);
    } else if (eventName === 'REMOVE' && oldGame) {
      await handleCompletedGameRemove(docClient, tableName, oldGame);
    }
  }
}
