import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  hasCurrentGameRow,
  hasRecentCompletedRow,
  listRecentCompletedRows,
  recentCompletedRowToGame,
  COMPLETED_DASHBOARD_RETENTION_MS,
  type RecentCompletedIndexRow,
} from './recentCompletedGames';
import {
  applyOverlayFields,
  listUserGameOverlays,
  type UserGameOverlay,
} from './userGameOverlay';

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

export function mergeDashboardGames(
  currentRows: CurrentGameIndexRow[],
  recentCompletedRows: RecentCompletedIndexRow[],
  overlays: Map<string, UserGameOverlay>,
): DashboardGame[] {
  const activeById = new Map(
    currentRows.map(row => {
      const game = currentRowToGame(row);
      return [game.id, applyOverlayFields(game, overlays.get(game.id))];
    }),
  );
  const completedById = new Map(
    recentCompletedRows.map(row => {
      const game = recentCompletedRowToGame(row);
      return [game.id, applyOverlayFields(game, overlays.get(game.id))];
    }),
  );

  const result: DashboardGame[] = [];
  const emitted = new Set<string>();

  for (const [id, game] of activeById) {
    result.push(game);
    emitted.add(id);
  }

  for (const [id, game] of completedById) {
    if (!emitted.has(id)) {
      result.push(game);
      emitted.add(id);
    }
  }

  return result;
}

/**
 * In-memory prune of completed dashboard games seen >7 days ago with no newer chat.
 * Matches the eviction loop in me() before side-effect writes.
 */
export function pruneSeenCompletedDashboardGames(
  games: DashboardGame[],
  now = Date.now(),
): { games: DashboardGame[]; evictedIds: string[] } {
  const evictedIds: string[] = [];
  const kept: DashboardGame[] = [];
  for (const game of games) {
    if (
      (game.toMove === '' || game.toMove === null) &&
      game.seen !== undefined &&
      now - (game.seen || 0) > COMPLETED_DASHBOARD_RETENTION_MS &&
      (game.lastChat || 0) <= (game.seen || 0)
    ) {
      evictedIds.push(game.id);
    } else {
      kept.push(game);
    }
  }
  return { games: kept, evictedIds };
}

export type DashboardGameLoad = {
  games: DashboardGame[];
  currentRows: CurrentGameIndexRow[];
  recentCompletedRows: RecentCompletedIndexRow[];
};

/** Whether opening a game (setSeenTime) may update USERGAME# seen. Index membership only. */
export async function shouldWriteGameOpenOverlay(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<boolean> {
  const [onCurrent, onRecent] = await Promise.all([
    hasCurrentGameRow(client, tableName, userId, gameId),
    hasRecentCompletedRow(client, tableName, userId, gameId),
  ]);
  return onCurrent || onRecent;
}

export async function loadDashboardGameData(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<DashboardGameLoad> {
  const [currentRows, recentCompletedRows, overlays] = await Promise.all([
    listCurrentGameRows(client, tableName, userId),
    listRecentCompletedRows(client, tableName, userId),
    listUserGameOverlays(client, tableName, userId),
  ]);
  const games = mergeDashboardGames(currentRows, recentCompletedRows, overlays);
  return { games, currentRows, recentCompletedRows };
}

export async function loadDashboardGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<DashboardGame[]> {
  const { games } = await loadDashboardGameData(client, tableName, userId);
  return games;
}
