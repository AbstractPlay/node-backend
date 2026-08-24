import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  purgeActiveGameDashboardIndexes,
  purgeCompletedGameDashboardIndexes,
  type GameRecord,
} from './gameProjector';
import { unwatchGame } from './playerGameMarks';

export type AdminDeleteGameSummary = {
  gameId: string;
  metaGame: string;
  cbit: 0 | 1;
  deleted: string[];
  notFound?: boolean;
};

type GameLike = {
  id: string;
  metaGame: string;
  players: { id: string; name?: string }[];
  lastMoveTime: number;
  state: string;
  numPlayers: number;
  clockHard: boolean;
  toMove: string | boolean[];
  numMoves?: number;
  gameEnded?: number;
  winner?: number[];
  commented?: number;
  variants?: string[];
  noExplore?: boolean;
  gameStarted?: number;
};

async function humanPlayerIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  players: { id: string }[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const player of players) {
    const bot = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'BOT', sk: player.id },
    }));
    if (bot.Item === undefined) {
      ids.push(player.id);
    }
  }
  return ids;
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

function toGameRecord(game: GameLike, cbit: 0 | 1): GameRecord {
  return {
    pk: 'GAME',
    sk: `${game.metaGame}#${cbit}#${game.id}`,
    id: game.id,
    metaGame: game.metaGame,
    numPlayers: game.numPlayers,
    players: game.players.map(player => ({
      id: player.id,
      name: 'name' in player && typeof player.name === 'string' ? player.name : player.id,
    })),
    clockHard: game.clockHard,
    toMove: game.toMove,
    lastMoveTime: game.lastMoveTime,
    state: game.state,
    numMoves: game.numMoves,
    gameEnded: game.gameEnded,
    winner: game.winner,
    commented: game.commented,
    variants: game.variants,
    noExplore: game.noExplore,
    gameStarted: game.gameStarted,
  };
}

async function purgeWatchers(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
): Promise<void> {
  const watchers = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `GAMEWATCHERS#${gameId}` },
    ProjectionExpression: 'sk',
  });
  await Promise.all(watchers.map(watcher =>
    unwatchGame(client, tableName, watcher.sk as string, gameId),
  ));
}

async function purgeHighlights(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  playerIds: string[],
): Promise<void> {
  await Promise.all(playerIds.map(playerId =>
    client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `HIGHLIGHT#${playerId}`, sk: `${metaGame}#${gameId}` },
    })),
  ));
}

async function purgeRepresentatives(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
): Promise<void> {
  const suffix = `#${gameId}`;
  const representatives = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': `REPRESENTATIVE#${metaGame}` },
    ProjectionExpression: 'sk',
  });
  const matches = representatives.filter(item =>
    typeof item.sk === 'string' && item.sk.endsWith(suffix),
  );
  await Promise.all(matches.map(item => {
    const sk = item.sk as string;
    const userId = sk.slice(0, -suffix.length);
    return Promise.all([
      client.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: `REPRESENTATIVE#${metaGame}`, sk },
      })),
      client.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: `PLAYER#${userId}`, sk: `REPRESENTATIVE#${metaGame}#${gameId}` },
      })),
    ]);
  }));
}

async function deleteExplorations(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  cbit: 0 | 1,
): Promise<void> {
  const queries = [
    client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `GAMEEXPLORATION#${gameId}` },
    })),
  ];
  if (cbit === 1) {
    queries.push(client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `PUBLICEXPLORATION#${gameId}` },
    })));
  }
  const results = await Promise.all(queries);
  const items = results.flatMap(result => result.Items ?? []);
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    if (chunk.length === 0) {
      continue;
    }
    await client.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map(item => ({
          DeleteRequest: {
            Key: { pk: item.pk, sk: item.sk },
          },
        })),
      },
    }));
  }
}

export async function loadGameForAdminDelete(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  preferredCbit: 0 | 1,
): Promise<{ game: GameLike; cbit: 0 | 1 } | undefined> {
  const trimmedId = gameId.trim();
  const order: (0 | 1)[] = preferredCbit === 0 ? [0, 1] : [1, 0];
  for (const cbit of order) {
    const data = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'GAME', sk: `${metaGame}#${cbit}#${trimmedId}` },
    }));
    if (data.Item !== undefined) {
      return { game: data.Item as GameLike, cbit };
    }
  }
  return undefined;
}

export async function adminDeleteGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  preferredCbit: 0 | 1,
): Promise<AdminDeleteGameSummary> {
  const loaded = await loadGameForAdminDelete(client, tableName, metaGame, gameId, preferredCbit);
  if (loaded === undefined) {
    return {
      gameId: gameId.trim(),
      metaGame,
      cbit: preferredCbit,
      deleted: [],
      notFound: true,
    };
  }

  const { game, cbit } = loaded;
  const deleted: string[] = [];
  const playerIds = await humanPlayerIds(client, tableName, game.players);
  const gameRecord = toGameRecord(game, cbit);

  await purgeWatchers(client, tableName, game.id);
  deleted.push('watchers');

  await purgeHighlights(client, tableName, metaGame, game.id, playerIds);
  deleted.push('highlights');

  await purgeRepresentatives(client, tableName, metaGame, game.id);
  deleted.push('representatives');

  if (cbit === 0) {
    await purgeActiveGameDashboardIndexes(client, tableName, gameRecord, playerIds);
    deleted.push('currentgames', 'usergame-overlays', 'meta-counts');
  } else {
    await purgeCompletedGameDashboardIndexes(client, tableName, gameRecord, playerIds);
    deleted.push('completedgames-index', 'recentcompleted', 'usergame-overlays');
  }

  await Promise.all(game.players.map(player =>
    client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: 'NOTE', sk: `${game.id}#${player.id}` },
    })),
  ));
  deleted.push('notes');

  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'GAMECOMMENTS', sk: game.id },
  }));
  deleted.push('comments');

  await deleteExplorations(client, tableName, game.id, cbit);
  deleted.push('explorations');

  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'GAME', sk: `${metaGame}#${cbit}#${game.id}` },
  }));
  deleted.push('game');

  return { gameId: game.id, metaGame, cbit, deleted };
}
