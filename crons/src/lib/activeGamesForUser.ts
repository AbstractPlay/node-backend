import {
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

export type CurrentGameRow = {
  sk: string;
  id?: string;
  metaGame: string;
  variants?: string[];
  toMove?: string | boolean[] | null;
};

export function isActiveDashboardGame(game: { toMove?: string | boolean[] | null }): boolean {
  return game.toMove !== '' && game.toMove !== null && game.toMove !== undefined;
}

export async function listActiveCurrentGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<CurrentGameRow[]> {
  const items: CurrentGameRow[] = [];
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
      const row = item as CurrentGameRow;
      if (isActiveDashboardGame(row)) {
        items.push(row);
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}
