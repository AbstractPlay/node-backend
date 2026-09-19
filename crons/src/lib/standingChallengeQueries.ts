import { gameinfo } from '@abstractplay/gameslib';
import {
  BatchGetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export type OpenChallengeRecord = Record<string, unknown> & {
  id?: string;
  metaGame: string;
  challenger?: { id?: string; name?: string };
};

function metaGameUids(): string[] {
  const metaGames: string[] = [];
  gameinfo.forEach(g => metaGames.push(g.uid));
  return metaGames;
}

export async function listMetaGamesWithStandingChallenges(
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

export async function queryStandingChallengesForMetaGame(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
): Promise<OpenChallengeRecord[]> {
  const items: OpenChallengeRecord[] = [];
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
      items.push(item as OpenChallengeRecord);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey !== undefined);
  return items;
}

export async function queryAllStandingChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<OpenChallengeRecord[]> {
  const activeMetaGames = await listMetaGamesWithStandingChallenges(client, tableName);
  const chunks = await Promise.all(
    activeMetaGames.map(metaGame => queryStandingChallengesForMetaGame(client, tableName, metaGame)),
  );
  return chunks.flat();
}

export async function queryAllDirectChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<OpenChallengeRecord[]> {
  const items: OpenChallengeRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': 'CHALLENGE' },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      items.push(item as OpenChallengeRecord);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey !== undefined);
  return items;
}
