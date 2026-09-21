import {
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const RECENT_COMPLETED_CACHE_TTL_MS = 30_000;
export const RECENT_COMPLETED_DEFAULT_DAYS = 7;
export const RECENT_COMPLETED_MAX_DAYS = 30;

const MS_PER_DAY = 86_400_000;
const GLOBAL_COMPLETED_PK = 'COMPLETEDGAMES';

export type CompletedGameSummary = Record<string, unknown> & {
  id: string;
  metaGame: string;
  lastMoveTime: number;
};

type RecentCompletedCacheEntry = {
  days: number;
  items: CompletedGameSummary[];
  loadedAt: number;
};

let recentCompletedCache: RecentCompletedCacheEntry | undefined;

export function completedGamesSinceSk(sinceMs: number): string {
  return String(sinceMs);
}

export function recentCompletedSinceMs(days: number, now = Date.now()): number {
  return now - days * MS_PER_DAY;
}

function normalizeDays(days: unknown): number {
  if (days === undefined || days === null || days === '') {
    return RECENT_COMPLETED_DEFAULT_DAYS;
  }
  const parsed = Number(days);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('days must be a positive number.');
  }
  return Math.min(Math.floor(parsed), RECENT_COMPLETED_MAX_DAYS);
}

async function loadRecentCompletedGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  days: number,
): Promise<CompletedGameSummary[]> {
  const sinceSk = completedGamesSinceSk(recentCompletedSinceMs(days));
  const items: CompletedGameSummary[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND #sk >= :since',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': GLOBAL_COMPLETED_PK,
        ':since': sinceSk,
      },
      ScanIndexForward: false,
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      items.push(item as CompletedGameSummary);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function getCachedRecentCompletedGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  days: number,
): Promise<CompletedGameSummary[]> {
  if (
    recentCompletedCache !== undefined
    && recentCompletedCache.days === days
    && Date.now() - recentCompletedCache.loadedAt < RECENT_COMPLETED_CACHE_TTL_MS
  ) {
    return recentCompletedCache.items;
  }
  const items = await loadRecentCompletedGames(client, tableName, days);
  recentCompletedCache = { days, items, loadedAt: Date.now() };
  return items;
}

export type RecentCompletedGamesPars = {
  days?: unknown;
};

export type RecentCompletedGamesResult = {
  items: CompletedGameSummary[];
};

export async function queryRecentCompletedGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  pars: RecentCompletedGamesPars,
): Promise<RecentCompletedGamesResult> {
  const days = normalizeDays(pars.days);
  const items = await getCachedRecentCompletedGames(client, tableName, days);
  return { items };
}

export async function updateCompletedGameCommentedFlag(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  gameId: string,
  gameEnded: number,
  commented: number,
): Promise<void> {
  const sk = `${gameEnded}#${gameId}`;
  const keys = [
    { pk: GLOBAL_COMPLETED_PK, sk },
    { pk: `COMPLETEDGAMES#${metaGame}`, sk },
  ];
  await Promise.all(keys.map((Key) => client.send(new UpdateCommand({
    TableName: tableName,
    Key,
    ExpressionAttributeValues: { ':c': commented },
    UpdateExpression: 'set commented = :c',
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
  }))));
}

export function clearRecentCompletedGamesCacheForTests(): void {
  recentCompletedCache = undefined;
}
