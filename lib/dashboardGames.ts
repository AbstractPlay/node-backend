import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  applyOverlayFields,
  listUserGameOverlays,
  type UserGameOverlay,
} from './userGameOverlay.js';

export type DashboardGame = {
  id: string;
  metaGame: string;
  players: { id: string; name: string; time?: number }[];
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  lastMoveTime: number;
  variants?: string[];
  gameStarted?: number;
  gameEnded?: number;
  winner?: number[];
  numMoves?: number;
  seen?: number;
  lastChat?: number;
  commented?: number;
  note?: string;
};

export type CurrentGameIndexRow = {
  pk: string;
  sk: string;
  id?: string;
  metaGame: string;
  players: DashboardGame['players'];
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  lastMoveTime: number;
  variants?: string[];
  gameStarted?: number;
  numMoves?: number;
};

export function isActiveDashboardGame(game: { toMove?: string | boolean[] | null }): boolean {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

export function currentRowToGame(row: CurrentGameIndexRow): DashboardGame {
  const game: DashboardGame = {
    id: row.id ?? row.sk,
    metaGame: row.metaGame,
    players: row.players,
    clockHard: row.clockHard,
    noExplore: row.noExplore ?? false,
    toMove: row.toMove,
    lastMoveTime: row.lastMoveTime,
    variants: row.variants,
    gameStarted: row.gameStarted,
  };
  if (row.numMoves !== undefined) {
    game.numMoves = row.numMoves;
  }
  return game;
}

async function listCurrentGameRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<CurrentGameIndexRow[]> {
  const items: CurrentGameIndexRow[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `CURRENTGAMES#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item as CurrentGameIndexRow);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

export async function hasCurrentGameRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `CURRENTGAMES#${userId}`, sk: gameId },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  return data.Item !== undefined;
}

export function mergeDashboardGames(
  currentRows: CurrentGameIndexRow[],
  overlays: Map<string, UserGameOverlay>,
): DashboardGame[] {
  return currentRows.map(row => {
    const game = currentRowToGame(row);
    return applyOverlayFields(game, overlays.get(game.id));
  });
}

export type DashboardGameLoad = {
  games: DashboardGame[];
  currentRows: CurrentGameIndexRow[];
};

/** Whether opening a game (setSeenTime) may update USERGAME# seen. Active dashboard membership only. */
export async function shouldWriteGameOpenOverlay(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<boolean> {
  return hasCurrentGameRow(client, tableName, userId, gameId);
}

export async function loadDashboardGameData(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<DashboardGameLoad> {
  const [currentRows, overlays] = await Promise.all([
    listCurrentGameRows(client, tableName, userId),
    listUserGameOverlays(client, tableName, userId),
  ]);
  const games = mergeDashboardGames(currentRows, overlays);
  return { games, currentRows };
}

export type ActiveGameKey = {
  metaGame: string;
  id: string;
};

export async function listActiveGameKeys(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<ActiveGameKey[]> {
  const rows = await listCurrentGameRows(client, tableName, userId);
  return rows
    .filter(row => isActiveDashboardGame(row))
    .map(row => ({
      metaGame: row.metaGame,
      id: row.id ?? row.sk,
    }));
}

export async function loadDashboardGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<DashboardGame[]> {
  const { games } = await loadDashboardGameData(client, tableName, userId);
  return games;
}
