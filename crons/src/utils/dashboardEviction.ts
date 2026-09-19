/**
 * Idempotent RECENTCOMPLETED# + USERGAME# eviction.
 * Keep in sync with node-backend lib/dashboardEviction.ts
 */
import {
  DeleteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export type DashboardEvictionStats = {
  recentCompletedDeleted: number;
  userGameDeleted: number;
};

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
    deleteRow(client, tableName, `RECENTCOMPLETED#${userId}`, gameId),
    deleteRow(client, tableName, `USERGAME#${userId}`, gameId),
  ])));

  return {
    recentCompletedDeleted: gameIds.length,
    userGameDeleted: gameIds.length,
  };
}
