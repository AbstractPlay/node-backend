import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  hasCurrentGameRow,
  hasRecentCompletedRow,
  listRecentCompletedRows,
  recentCompletedRowToGame,
  shouldBeOnCompletedDashboard,
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
  legacyGames: DashboardGame[],
): DashboardGame[] {
  const legacyById = new Map(legacyGames.map(game => [game.id, game]));
  const activeById = new Map(
    currentRows.map(row => {
      const game = currentRowToGame(row);
      return [game.id, applyOverlayFields(game, overlays.get(game.id), legacyById.get(game.id))];
    }),
  );
  const completedById = new Map(
    recentCompletedRows.map(row => {
      const game = recentCompletedRowToGame(row);
      return [game.id, applyOverlayFields(game, overlays.get(game.id), legacyById.get(game.id))];
    }),
  );
  const useActiveIndex = currentRows.length > 0;
  const useCompletedIndex = recentCompletedRows.length > 0;

  if (!useActiveIndex && !useCompletedIndex) {
    return legacyGames
      .filter(game => {
        const withOverlay = applyOverlayFields({ ...game }, overlays.get(game.id), game);
        return isActiveDashboardGame(withOverlay) || shouldBeOnCompletedDashboard(withOverlay);
      })
      .map(game => applyOverlayFields({ ...game }, overlays.get(game.id), game));
  }

  const result: DashboardGame[] = [];
  const emitted = new Set<string>();

  for (const legacy of legacyGames) {
    if (isActiveDashboardGame(legacy)) {
      const indexed = activeById.get(legacy.id);
      if (indexed) {
        result.push(indexed);
        emitted.add(legacy.id);
      } else if (useActiveIndex) {
        // Stale legacy active: stream removed CURRENTGAMES# on completion.
      } else if (useCompletedIndex && completedById.has(legacy.id)) {
        // Defer to RECENTCOMPLETED# pass — legacy still shows pre-completion toMove.
      } else {
        result.push(applyOverlayFields({ ...legacy }, overlays.get(legacy.id), legacy));
        emitted.add(legacy.id);
      }
      continue;
    }

    if (useCompletedIndex) {
      const indexed = completedById.get(legacy.id);
      if (indexed) {
        result.push(indexed);
        emitted.add(legacy.id);
      }
    } else {
      const withOverlay = applyOverlayFields({ ...legacy }, overlays.get(legacy.id), legacy);
      if (shouldBeOnCompletedDashboard(withOverlay)) {
        result.push(withOverlay);
        emitted.add(legacy.id);
      }
    }
  }

  for (const [id, game] of activeById) {
    if (!emitted.has(id)) {
      result.push(game);
      emitted.add(id);
    }
  }

  for (const [id, game] of completedById) {
    if (!emitted.has(id)) {
      result.push(game);
      emitted.add(id);
    }
  }

  return result;
}

/** Legacy USER.games[] rows still marked active after stream completion or index removal. */
export function staleLegacyActiveGameIds(
  legacyGames: DashboardGame[],
  currentRows: CurrentGameIndexRow[],
  recentCompletedRows: RecentCompletedIndexRow[],
): string[] {
  const currentIds = new Set(currentRows.map(row => row.id ?? row.sk));
  const recentIds = new Set(recentCompletedRows.map(row => row.id ?? row.sk));
  const useActiveIndex = currentRows.length > 0;
  return legacyGames
    .filter(game => isActiveDashboardGame(game) && (
      (useActiveIndex && !currentIds.has(game.id)) ||
      recentIds.has(game.id)
    ))
    .map(game => game.id);
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

/**
 * Whether opening a game (setSeenTime) may update USERGAME# seen.
 * Index membership (CURRENTGAMES# / RECENTCOMPLETED#) is authoritative when present.
 * Legacy USER.games[] alone does not qualify for completed games once RECENTCOMPLETED# exists,
 * and stale legacy completed entries must pass shouldBeOnCompletedDashboard.
 */
export async function shouldWriteGameOpenOverlay(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
  legacyGames?: DashboardGame[],
): Promise<boolean> {
  const [onCurrent, onRecent] = await Promise.all([
    hasCurrentGameRow(client, tableName, userId, gameId),
    hasRecentCompletedRow(client, tableName, userId, gameId),
  ]);
  if (onCurrent || onRecent) {
    return true;
  }

  const legacy = legacyGames?.find(game => game.id === gameId);
  if (!legacy) {
    return false;
  }

  const recentCompletedRows = await listRecentCompletedRows(client, tableName, userId);
  if (recentCompletedRows.length > 0) {
    return false;
  }

  if (isActiveDashboardGame(legacy)) {
    return true;
  }

  const overlayData = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `USERGAME#${userId}`, sk: gameId },
    ProjectionExpression: 'seen, lastChat',
  }));
  const overlay = overlayData.Item as UserGameOverlay | undefined;
  const withOverlay = applyOverlayFields({ ...legacy }, overlay, legacy);
  return shouldBeOnCompletedDashboard(withOverlay);
}

export async function loadDashboardGameData(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  legacyGames: DashboardGame[],
): Promise<DashboardGameLoad> {
  const [currentRows, recentCompletedRows, overlays] = await Promise.all([
    listCurrentGameRows(client, tableName, userId),
    listRecentCompletedRows(client, tableName, userId),
    listUserGameOverlays(client, tableName, userId),
  ]);
  const games = mergeDashboardGames(currentRows, recentCompletedRows, overlays, legacyGames);
  return { games, currentRows, recentCompletedRows };
}

export async function loadDashboardGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  legacyGames: DashboardGame[],
): Promise<DashboardGame[]> {
  const { games } = await loadDashboardGameData(client, tableName, userId, legacyGames);
  return games;
}
