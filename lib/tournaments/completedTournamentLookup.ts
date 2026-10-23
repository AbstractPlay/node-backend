import {
  GetCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export function isConcreteMetaGame(metaGame?: string): boolean {
  return metaGame !== undefined && metaGame !== '' && metaGame !== 'undefined';
}

/** One RCU Get when metaGame is known (`COMPLETEDTOURNAMENT` / `<metaGame>#<id>`). */
export async function findCompletedTournament(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  metaGame?: string,
): Promise<Record<string, unknown> | undefined> {
  if (!isConcreteMetaGame(metaGame)) {
    return undefined;
  }

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
  return undefined;
}
