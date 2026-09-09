import { gameinfo } from '@abstractplay/gameslib';
import {
  BatchGetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const ALL_STANDING_CHALLENGES_CACHE_TTL_MS = 30_000;

export type StandingChallengeRecord = Record<string, unknown> & {
  id?: string;
  metaGame: string;
  dateIssued?: number;
  challenger?: { id?: string };
};

type StandingChallengeCacheEntry = {
  items: StandingChallengeRecord[];
  loadedAt: number;
};

let standingChallengeCache: StandingChallengeCacheEntry | undefined;

function metaGameUids(): string[] {
  const metaGames: string[] = [];
  gameinfo.forEach(g => metaGames.push(g.uid));
  return metaGames;
}

async function loadMetaGamesWithStandingChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<string[]> {
  const metaGames = metaGameUids();
  const active: string[] = [];
  for (let i = 0; i < metaGames.length; i += 100) {
    const chunk = metaGames.slice(i, i + 100);
    const data = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(metaGame => ({ pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' })),
        },
      },
    }));
    for (const item of data.Responses?.[tableName] ?? []) {
      const metaGame = String(item.pk).replace('METAGAMES#', '');
      if (((item.standingchallenges as number | undefined) ?? 0) > 0) {
        active.push(metaGame);
      }
    }
  }
  return active;
}

async function queryStandingChallengesForMetaGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
): Promise<StandingChallengeRecord[]> {
  const items: StandingChallengeRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `STANDINGCHALLENGE#${metaGame}` },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      items.push(item as StandingChallengeRecord);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function loadAllStandingChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<StandingChallengeRecord[]> {
  const activeMetaGames = await loadMetaGamesWithStandingChallenges(client, tableName);
  const chunks = await Promise.all(
    activeMetaGames.map(metaGame => queryStandingChallengesForMetaGame(client, tableName, metaGame)),
  );
  return chunks
    .flat()
    .sort((a, b) => (b.dateIssued ?? 0) - (a.dateIssued ?? 0));
}

async function getCachedStandingChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<StandingChallengeRecord[]> {
  if (
    standingChallengeCache !== undefined
    && Date.now() - standingChallengeCache.loadedAt < ALL_STANDING_CHALLENGES_CACHE_TTL_MS
  ) {
    return standingChallengeCache.items;
  }
  const items = await loadAllStandingChallenges(client, tableName);
  standingChallengeCache = { items, loadedAt: Date.now() };
  return items;
}

export function filterStandingChallengesForBlockedIssuers(
  items: StandingChallengeRecord[],
  blockedBy: string[],
): StandingChallengeRecord[] {
  if (blockedBy.length === 0) {
    return items;
  }
  const blockedBySet = new Set(blockedBy);
  return items.filter(item => !blockedBySet.has(item.challenger?.id ?? ''));
}

export async function queryAllStandingChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
  blockedBy: string[] = [],
): Promise<StandingChallengeRecord[]> {
  const items = await getCachedStandingChallenges(client, tableName);
  return filterStandingChallengesForBlockedIssuers(items, blockedBy);
}

export function clearAllStandingChallengesCacheForTests(): void {
  standingChallengeCache = undefined;
}

/** @internal Exported for tests that stub meta-game discovery. */
export async function listMetaGamesWithStandingChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<string[]> {
  return loadMetaGamesWithStandingChallenges(client, tableName);
}
