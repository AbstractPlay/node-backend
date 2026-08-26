import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DashboardGame } from './dashboardGames';

export type RecentCompletedIndexRow = {
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
  gameEnded?: number;
  winner?: number[];
  numMoves?: number;
  commented?: number;
};

export type RecentCompletedSummary = Omit<RecentCompletedIndexRow, 'pk' | 'sk'> & {
  id: string;
};

export function recentCompletedPk(userId: string): string {
  return `RECENTCOMPLETED#${userId}`;
}

export function recentCompletedRowToGame(row: RecentCompletedIndexRow): DashboardGame {
  const game: DashboardGame = {
    id: row.id ?? row.sk,
    metaGame: row.metaGame,
    players: row.players,
    clockHard: row.clockHard,
    noExplore: row.noExplore ?? false,
    toMove: row.toMove ?? '',
    lastMoveTime: row.lastMoveTime,
    variants: row.variants,
    gameStarted: row.gameStarted,
    gameEnded: row.gameEnded,
    winner: row.winner,
    commented: row.commented,
  };
  if (row.numMoves !== undefined) {
    game.numMoves = row.numMoves;
  }
  return game;
}

export const COMPLETED_DASHBOARD_RETENTION_MS = 7 * 24 * 3600000;

export function shouldBeOnCompletedDashboard(
  game: { toMove?: string | boolean[] | null; seen?: number; lastChat?: number },
  now = Date.now(),
): boolean {
  if (game.toMove !== '' && game.toMove !== null && game.toMove !== undefined) {
    return false;
  }
  if (game.seen === undefined) {
    return true;
  }
  if ((game.lastChat || 0) > game.seen) {
    return true;
  }
  return now - game.seen <= COMPLETED_DASHBOARD_RETENTION_MS;
}

async function queryRecentCompletedRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<RecentCompletedIndexRow[]> {
  const items: RecentCompletedIndexRow[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': recentCompletedPk(userId) },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item as RecentCompletedIndexRow);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

export async function listRecentCompletedRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<RecentCompletedIndexRow[]> {
  return queryRecentCompletedRows(client, tableName, userId);
}

export async function hasRecentCompletedRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: recentCompletedPk(userId), sk: gameId },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  return data.Item !== undefined;
}

export async function deleteRecentCompletedRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: recentCompletedPk(userId), sk: gameId },
  }));
}
