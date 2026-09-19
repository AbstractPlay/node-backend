/**
 * Index-only dashboard cruft cleanup.
 * Keep in sync with node-backend lib/dashboardCruftCleanup.ts
 */
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { removeDashboardGameMembership } from './dashboardEviction.js';

const COMPLETED_DASHBOARD_RETENTION_MS = 7 * 24 * 3600000;

export type DashboardCruftCleanupStats = {
  recentCompletedDeleted: number;
  userGameDeleted: number;
};

type OverlayFields = {
  seen?: number;
  lastChat?: number;
};

type RecentRow = {
  sk: string;
  metaGame: string;
  players: { id: string; name: string }[];
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

function shouldBeOnCompletedDashboard(
  game: { toMove?: string | boolean[] | null; seen?: number; lastChat?: number },
  now: number,
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

function applyOverlayFields<T extends OverlayFields>(
  game: T,
  overlay: OverlayFields | undefined,
): T {
  const result = { ...game };
  if (overlay?.seen !== undefined) {
    result.seen = overlay.seen;
  } else {
    delete result.seen;
  }
  if (overlay?.lastChat !== undefined) {
    result.lastChat = overlay.lastChat;
  } else {
    delete result.lastChat;
  }
  return result;
}

async function queryPartition(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    if (page.Items) {
      items.push(...page.Items);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function deleteRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  sk: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk, sk },
  }));
}

export async function cleanupUserDashboardCruft(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now = Date.now(),
): Promise<DashboardCruftCleanupStats> {
  const [currentRows, recentRows, overlayRows] = await Promise.all([
    queryPartition(client, tableName, `CURRENTGAMES#${userId}`),
    queryPartition(client, tableName, `RECENTCOMPLETED#${userId}`),
    queryPartition(client, tableName, `USERGAME#${userId}`),
  ]);

  const currentIds = new Set(currentRows.map(row => String(row.sk)));
  const overlays = new Map<string, OverlayFields>();
  for (const row of overlayRows) {
    overlays.set(String(row.sk), {
      seen: typeof row.seen === 'number' ? row.seen : undefined,
      lastChat: typeof row.lastChat === 'number' ? row.lastChat : undefined,
    });
  }

  let recentCompletedDeleted = 0;
  let userGameDeleted = 0;
  const eligibleRecentIds = new Set<string>();

  for (const row of recentRows as RecentRow[]) {
    const merged = applyOverlayFields({
      toMove: row.toMove ?? '',
      seen: overlays.get(row.sk)?.seen,
      lastChat: overlays.get(row.sk)?.lastChat,
    }, overlays.get(row.sk));
    if (shouldBeOnCompletedDashboard(merged, now)) {
      eligibleRecentIds.add(row.sk);
      continue;
    }
    const evicted = await removeDashboardGameMembership(
      client,
      tableName,
      userId,
      [row.sk],
    );
    overlays.delete(row.sk);
    recentCompletedDeleted += evicted.recentCompletedDeleted;
    userGameDeleted += evicted.userGameDeleted;
  }

  const dashboardIds = new Set([...currentIds, ...eligibleRecentIds]);
  for (const gameId of overlays.keys()) {
    if (dashboardIds.has(gameId)) {
      continue;
    }
    await deleteRow(client, tableName, `USERGAME#${userId}`, gameId);
    userGameDeleted += 1;
  }

  return { recentCompletedDeleted, userGameDeleted };
}
