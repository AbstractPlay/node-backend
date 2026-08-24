import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { deleteRecentCompletedRow } from './recentCompletedGames';
import { deleteUserGameOverlay } from './userGameOverlay';

export type DashboardEvictionStats = {
  recentCompletedDeleted: number;
  userGameDeleted: number;
};

/**
 * Idempotent: delete RECENTCOMPLETED# + USERGAME# for each game id.
 * Shared by dashboard maintenance (me_dashboard) and abandoned-account cruft cleanup.
 */
export async function removeDashboardGameMembership(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameIds: string[],
): Promise<DashboardEvictionStats> {
  if (gameIds.length === 0) {
    return { recentCompletedDeleted: 0, userGameDeleted: 0 };
  }

  await Promise.all(gameIds.map(gameId => Promise.all([
    deleteRecentCompletedRow(client, tableName, userId, gameId),
    deleteUserGameOverlay(client, tableName, userId, gameId),
  ])));

  return {
    recentCompletedDeleted: gameIds.length,
    userGameDeleted: gameIds.length,
  };
}
