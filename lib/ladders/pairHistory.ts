import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

export async function recordLadderPairPlayed(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userA: string,
  userB: string,
  playedAt: number,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: 'LADDERPAIR',
      sk: ladderPairSk(ladderId, userA, userB),
      ladderId,
      lastPlayedAt: playedAt,
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
