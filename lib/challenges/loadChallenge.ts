import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type LoadedChallenge = {
  item: Record<string, unknown>;
  /** Where to persist updates */
  storagePk: 'CHALLENGE' | `STANDINGCHALLENGE#${string}`;
  isStanding: boolean;
  isFillableProjectionOnly: boolean;
};

export async function loadChallengeById(
  client: DynamoDBDocumentClient,
  tableName: string,
  challengeId: string,
  metaGame: string,
  options?: { preferStanding?: boolean },
): Promise<LoadedChallenge | undefined> {
  const preferStanding = options?.preferStanding === true;

  const tryDirect = async (): Promise<LoadedChallenge | undefined> => {
    const data = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: 'CHALLENGE', sk: challengeId },
      }),
    );
    if (data.Item === undefined) {
      return undefined;
    }
    return {
      item: data.Item,
      storagePk: 'CHALLENGE',
      isStanding: false,
      isFillableProjectionOnly: false,
    };
  };

  const tryStanding = async (): Promise<LoadedChallenge | undefined> => {
    const data = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: `STANDINGCHALLENGE#${metaGame}`, sk: challengeId },
      }),
    );
    if (data.Item === undefined) {
      return undefined;
    }
    const item = data.Item;
    if (item.fillableDirect === true) {
      const canonical = await tryDirect();
      if (canonical !== undefined) {
        return canonical;
      }
      return {
        item,
        storagePk: `STANDINGCHALLENGE#${metaGame}`,
        isStanding: false,
        isFillableProjectionOnly: true,
      };
    }
    return {
      item,
      storagePk: `STANDINGCHALLENGE#${metaGame}`,
      isStanding: true,
      isFillableProjectionOnly: false,
    };
  };

  if (preferStanding) {
    return (await tryStanding()) ?? (await tryDirect());
  }
  return (await tryDirect()) ?? (await tryStanding());
}
