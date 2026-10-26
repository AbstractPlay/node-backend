import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function ladderPairSk(ladderId: string, userA: string, userB: string): string {
  const [lo, hi] = userA < userB ? [userA, userB] : [userB, userA];
  return `${ladderId}#${lo}#${hi}`;
}

export async function getLadderPairLastPlayedAt(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
): Promise<number | undefined> {
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'LADDERPAIR', sk: ladderPairSk(ladderId, userA, userB) },
    ProjectionExpression: 'lastPlayedAt',
  }));
  const at = (result.Item as { lastPlayedAt?: number } | undefined)?.lastPlayedAt;
  return typeof at === 'number' ? at : undefined;
}

/** Unsettled ladder games between this pair on the ladder (0 or 1 when guards are enforced). */
export async function getOpenLadderGameCountBetween(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
): Promise<number> {
  const result = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'LADDERPAIR', sk: ladderPairSk(ladderId, userA, userB) },
    ProjectionExpression: 'openLadderGameCount',
  }));
  const count = (result.Item as { openLadderGameCount?: number } | undefined)?.openLadderGameCount;
  return typeof count === 'number' && count > 0 ? count : 0;
}

export function ladderPairOpenGameIncrementTransactItem(
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
) {
  return {
    Update: {
      TableName: tableName,
      Key: { pk: 'LADDERPAIR', sk: ladderPairSk(ladderId, userA, userB) },
      UpdateExpression:
        'SET ladderId = :lid, openLadderGameCount = if_not_exists(openLadderGameCount, :zero) + :one',
      ConditionExpression:
        'attribute_not_exists(openLadderGameCount) OR openLadderGameCount = :zero',
      ExpressionAttributeValues: {
        ':lid': ladderId,
        ':zero': 0,
        ':one': 1,
      },
    },
  };
}

export function ladderPairOpenGameDecrementTransactItem(
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
) {
  return {
    Update: {
      TableName: tableName,
      Key: { pk: 'LADDERPAIR', sk: ladderPairSk(ladderId, userA, userB) },
      UpdateExpression: 'ADD openLadderGameCount :neg',
      ConditionExpression: 'openLadderGameCount >= :one',
      ExpressionAttributeValues: { ':neg': -1, ':one': 1 },
    },
  };
}

export async function recordLadderPairPlayed(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
  playedAt: number,
): Promise<void> {
  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: 'LADDERPAIR', sk: ladderPairSk(ladderId, userA, userB) },
    UpdateExpression:
      'SET ladderId = :lid, lastPlayedAt = :at, openLadderGameCount = :zero',
    ExpressionAttributeValues: {
      ':lid': ladderId,
      ':at': playedAt,
      ':zero': 0,
    },
  }));
}

export function isWithinRematchCooldown(
  lastPlayedAt: number | undefined,
  cooldownDays: number,
  now: number,
): boolean {
  if (lastPlayedAt === undefined) {
    return false;
  }
  const ms = cooldownDays * 86_400_000;
  return now - lastPlayedAt < ms;
}
