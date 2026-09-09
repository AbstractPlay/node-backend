import {
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const RECENT_COMPLETED_CACHE_TTL_MS = 30_000;
export const RECENT_COMPLETED_DEFAULT_DAYS = 30;
export const RECENT_COMPLETED_DEFAULT_LIMIT = 100;
export const RECENT_COMPLETED_MAX_DAYS = 90;
export const RECENT_COMPLETED_MAX_LIMIT = 500;

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

function normalizeLimit(limit: unknown): number {
  if (limit === undefined || limit === null || limit === '') {
    return RECENT_COMPLETED_DEFAULT_LIMIT;
  }
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('limit must be a positive number.');
  }
  return Math.min(Math.floor(parsed), RECENT_COMPLETED_MAX_LIMIT);
}

function decodeOffsetKey(exclusiveStartKey: unknown): number {
  if (exclusiveStartKey === undefined || exclusiveStartKey === null || exclusiveStartKey === '') {
    return 0;
  }
  if (typeof exclusiveStartKey !== 'string') {
    throw new Error('exclusiveStartKey must be a string.');
  }
  const parsed = JSON.parse(exclusiveStartKey) as { offset?: unknown };
  if (typeof parsed.offset !== 'number' || !Number.isFinite(parsed.offset) || parsed.offset < 0) {
    throw new Error('exclusiveStartKey is invalid.');
  }
  return Math.floor(parsed.offset);
}

function encodeOffsetKey(offset: number): string {
  return JSON.stringify({ offset });
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
  limit?: unknown;
  exclusiveStartKey?: unknown;
};

export type RecentCompletedGamesResult = {
  items: CompletedGameSummary[];
  lastEvaluatedKey?: string;
};

export async function queryRecentCompletedGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  pars: RecentCompletedGamesPars,
): Promise<RecentCompletedGamesResult> {
  const days = normalizeDays(pars.days);
  const limit = normalizeLimit(pars.limit);
  const offset = decodeOffsetKey(pars.exclusiveStartKey);
  const allItems = await getCachedRecentCompletedGames(client, tableName, days);
  const items = allItems.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    ...(nextOffset < allItems.length ? { lastEvaluatedKey: encodeOffsetKey(nextOffset) } : {}),
  };
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
