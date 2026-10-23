import {
  GetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export function isConcreteMetaGame(metaGame?: string): boolean {
  return metaGame !== undefined && metaGame !== '' && metaGame !== 'undefined';
}

/** sk format: `<metaGame>#<tournamentId>` */
export function completedTournamentSkSuffix(tournamentId: string): string {
  return `#${tournamentId}`;
}

/**
 * DynamoDB has no `ends_with`; use `contains` on `#<uuid>` then verify sk suffix in code.
 */
export async function queryCompletedTournamentById(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
): Promise<Record<string, unknown> | undefined> {
  const suffix = completedTournamentSkSuffix(tournamentId);
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const data = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk',
        FilterExpression: 'contains(#sk, :needle)',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ExpressionAttributeValues: {
          ':pk': 'COMPLETEDTOURNAMENT',
          ':needle': suffix,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of data.Items ?? []) {
      const sk = item.sk;
      if (typeof sk === 'string' && sk.endsWith(suffix)) {
        return item as Record<string, unknown>;
      }
    }

    exclusiveStartKey = data.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey !== undefined);

  return undefined;
}

/** Load an archived tournament by id; optional metaGame avoids a partition query when known. */
export async function findCompletedTournament(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  metaGame?: string,
): Promise<Record<string, unknown> | undefined> {
  if (isConcreteMetaGame(metaGame)) {
    const data = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          pk: 'COMPLETEDTOURNAMENT',
          sk: `${metaGame}#${tournamentId}`,
        },
      }),
    );
    if (data.Item !== undefined) {
      return data.Item as Record<string, unknown>;
    }
  }

  return queryCompletedTournamentById(client, tableName, tournamentId);
}
