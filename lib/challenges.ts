import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

/** True when the user has opted out of receiving direct (named) challenges. */
export function declinesDirectChallenges(settings: unknown): boolean {
  if (settings === null || settings === undefined || typeof settings !== 'object') {
    return false;
  }
  const all = (settings as { all?: unknown }).all;
  if (all === null || all === undefined || typeof all !== 'object') {
    return false;
  }
  return (all as { noDirectChallenges?: unknown }).noDirectChallenges === true;
}

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
