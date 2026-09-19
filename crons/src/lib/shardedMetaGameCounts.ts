import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export type ShardedCountDeltas = {
  currentgames?: number;
  completedgames?: number;
  standingchallenges?: number;
  stars?: number;
  ratingsCount?: number;
};

export async function ensureShardedMetaGameCountEntry(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' },
    UpdateExpression: [
      'SET currentgames = if_not_exists(currentgames, :z)',
      'completedgames = if_not_exists(completedgames, :z)',
      'standingchallenges = if_not_exists(standingchallenges, :z)',
      'stars = if_not_exists(stars, :z)',
      'ratingsCount = if_not_exists(ratingsCount, :z)',
    ].join(', '),
    ExpressionAttributeValues: { ':z': 0 },
  }));
}

export async function adjustShardedCounts(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  metaGame: string,
  deltas: ShardedCountDeltas,
): Promise<void> {
  await ensureShardedMetaGameCountEntry(docClient, tableName, metaGame);
  const parts: string[] = [];
  const values: Record<string, number> = { ':z': 0 };
  if (deltas.currentgames !== undefined) {
    parts.push('currentgames = if_not_exists(currentgames, :z) + :cg');
    values[':cg'] = deltas.currentgames;
  }
  if (deltas.completedgames !== undefined) {
    parts.push('completedgames = if_not_exists(completedgames, :z) + :cd');
    values[':cd'] = deltas.completedgames;
  }
  if (deltas.standingchallenges !== undefined) {
    parts.push('standingchallenges = if_not_exists(standingchallenges, :z) + :sc');
    values[':sc'] = deltas.standingchallenges;
  }
  if (deltas.stars !== undefined) {
    parts.push('stars = if_not_exists(stars, :z) + :st');
    values[':st'] = deltas.stars;
  }
  if (deltas.ratingsCount !== undefined) {
    parts.push('ratingsCount = if_not_exists(ratingsCount, :z) + :rc');
    values[':rc'] = deltas.ratingsCount;
  }
  if (parts.length === 0) {
    return;
  }
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' },
    UpdateExpression: `SET ${parts.join(', ')}`,
    ExpressionAttributeValues: values,
  }));
}
