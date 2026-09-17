import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { effectiveOpenSlots } from './seatAccounting.js';

type ChallengeRecord = Record<string, unknown> & {
  id: string;
  metaGame: string;
  standing?: boolean;
  openSlots?: number;
};

export function needsFillableProjection(challenge: ChallengeRecord): boolean {
  return challenge.standing !== true && effectiveOpenSlots(challenge as { openSlots?: number }) > 0;
}

export function projectionItemFromChallenge(challenge: ChallengeRecord): Record<string, unknown> {
  return {
    ...challenge,
    pk: `STANDINGCHALLENGE#${challenge.metaGame}`,
    sk: challenge.id,
    fillableDirect: true,
    standing: false,
  };
}

export async function syncFillableProjection(
  client: DynamoDBDocumentClient,
  tableName: string,
  challenge: ChallengeRecord,
  countDeltaOnCreate: (metaGame: string, delta: number) => Promise<void>,
): Promise<void> {
  if (!needsFillableProjection(challenge)) {
    return;
  }
  const existing = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: `STANDINGCHALLENGE#${challenge.metaGame}`,
        sk: challenge.id,
      },
    }),
  );
  const hadProjection = existing.Item?.fillableDirect === true;
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: projectionItemFromChallenge(challenge),
    }),
  );
  if (!hadProjection) {
    await countDeltaOnCreate(challenge.metaGame, 1);
  }
}

export async function deleteFillableProjection(
  client: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  challengeId: string,
  countDeltaOnDelete: (metaGame: string, delta: number) => Promise<void>,
): Promise<void> {
  const existing = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        pk: `STANDINGCHALLENGE#${metaGame}`,
        sk: challengeId,
      },
    }),
  );
  if (existing.Item?.fillableDirect !== true) {
    return;
  }
  await client.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        pk: `STANDINGCHALLENGE#${metaGame}`,
        sk: challengeId,
      },
    }),
  );
  await countDeltaOnDelete(metaGame, -1);
}
