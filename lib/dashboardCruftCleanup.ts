import {
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { removeDashboardGameMembership } from './dashboardEviction';
import {
  listRecentCompletedRows,
  recentCompletedRowToGame,
  shouldBeOnCompletedDashboard,
} from './recentCompletedGames';
import {
  applyOverlayFields,
  deleteUserGameOverlay,
  listUserGameOverlays,
} from './userGameOverlay';

export type DashboardCruftCleanupStats = {
  recentCompletedDeleted: number;
  userGameDeleted: number;
};

async function listCurrentGameIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `CURRENTGAMES#${userId}` },
      ProjectionExpression: '#sk',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      if (typeof item.sk === 'string') {
        ids.add(item.sk);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return ids;
}

/**
 * Index-only dashboard cruft cleanup for abandoned-account maintenance.
 * Does not read or write USER.games[], and does not touch lastSeen.
 */
export async function cleanupUserDashboardCruft(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now = Date.now(),
): Promise<DashboardCruftCleanupStats> {
  const [currentIds, recentRows, overlays] = await Promise.all([
    listCurrentGameIds(client, tableName, userId),
    listRecentCompletedRows(client, tableName, userId),
    listUserGameOverlays(client, tableName, userId),
  ]);

  let recentCompletedDeleted = 0;
  let userGameDeleted = 0;
  const eligibleRecentIds = new Set<string>();

  for (const row of recentRows) {
    const merged = applyOverlayFields(
      recentCompletedRowToGame(row),
      overlays.get(row.sk),
    );
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
    await deleteUserGameOverlay(client, tableName, userId, gameId);
    userGameDeleted += 1;
  }

  return { recentCompletedDeleted, userGameDeleted };
}
