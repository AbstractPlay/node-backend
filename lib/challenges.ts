import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

export async function getChallengesByIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  challengeIds: Iterable<string>,
): Promise<Record<string, unknown>[]> {
  const ids = [...challengeIds];
  if (ids.length === 0) {
    return [];
  }

  const results = await Promise.all(ids.map((id) => {
    const ind = id.indexOf('#');
    if (ind > -1) {
      const metaGame = id.substring(0, ind);
      const challengeId = id.substring(ind + 1);
      return client.send(new GetCommand({
        TableName: tableName,
        Key: {
          pk: `STANDINGCHALLENGE#${metaGame}`,
          sk: challengeId,
        },
      }));
    }
    return client.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk: 'CHALLENGE',
        sk: id,
      },
    }));
  }));

  return results
    .map(result => result.Item)
    .filter((item): item is Record<string, unknown> => item !== undefined);
}
