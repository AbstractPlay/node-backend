import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DashboardGame } from './dashboardGames.js';
import {
  checkAndProcessGameTimeout,
  sweepUserGameTimeouts,
  type TimelossFn,
} from './gameTimeout.js';

export const DASHBOARD_MAINTENANCE_LEASE_MS = 30_000;

export type DashboardMaintenanceDeps = {
  client: DynamoDBDocumentClient;
  tableName: string;
  timeloss: TimelossFn;
  now?: () => number;
  log?: (message: string) => void;
};

export type DashboardMaintenanceResult = {
  games: DashboardGame[];
  evictedIds: string[];
  maintenanceRan: boolean;
};

export type MaintenanceLockResult = {
  acquired: boolean;
};

function isConditionalFailure(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'ConditionalCheckFailedException';
}

export async function acquireDashboardMaintenanceLock(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now = Date.now(),
): Promise<MaintenanceLockResult> {
  const leaseExpiry = now - DASHBOARD_MAINTENANCE_LEASE_MS;
  try {
    await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ConditionExpression: 'attribute_not_exists(dashboardMaintAt) OR dashboardMaintAt < :leaseExpiry',
      UpdateExpression: 'SET dashboardMaintAt = :now',
      ExpressionAttributeValues: {
        ':now': now,
        ':leaseExpiry': leaseExpiry,
      },
    }));
    return { acquired: true };
  } catch (err: unknown) {
    if (isConditionalFailure(err)) {
      return { acquired: false };
    }
    throw err;
  }
}

export async function runDashboardMaintenance(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  games: DashboardGame[],
  deps: DashboardMaintenanceDeps,
): Promise<DashboardMaintenanceResult> {
  const now = deps.now?.() ?? Date.now();
  const lock = await acquireDashboardMaintenanceLock(client, tableName, userId, now);
  if (!lock.acquired) {
    return { games, evictedIds: [], maintenanceRan: false };
  }

  const maintainedGames = await sweepUserGameTimeouts(games, {
    client: deps.client,
    tableName: deps.tableName,
    timeloss: deps.timeloss,
    now: () => now,
    log: deps.log,
  });

  return {
    games: maintainedGames,
    evictedIds: [],
    maintenanceRan: true,
  };
}

/** Exported for single-game get_game path (Option B). */
export { checkAndProcessGameTimeout };
