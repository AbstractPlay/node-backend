import {
  GetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export function isConcreteMetaGame(metaGame?: string): boolean {
  return metaGame !== undefined && metaGame !== '' && metaGame !== 'undefined';
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

  const data = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      FilterExpression: 'ends_with(#sk, :suffix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': 'COMPLETEDTOURNAMENT',
        ':suffix': `#${tournamentId}`,
      },
    }),
  );
  const item = data.Items?.[0];
  return item !== undefined ? (item as Record<string, unknown>) : undefined;
}
