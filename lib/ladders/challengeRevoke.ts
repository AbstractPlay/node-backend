import { BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { revokeChallenge } from '../challenges/authHandlers.js';

export async function revokePendingLadderChallengesForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userId: string,
): Promise<void> {
  const user = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'challenges_issued, challenges_received',
  }));
  const issued = user.Item?.challenges_issued as Set<string> | string[] | undefined;
  const received = user.Item?.challenges_received as Set<string> | string[] | undefined;
  const ids = new Set<string>([
    ...(issued instanceof Set ? [...issued] : Array.isArray(issued) ? issued : []),
    ...(received instanceof Set ? [...received] : Array.isArray(received) ? received : []),
  ]);
  if (ids.size === 0) {
    return;
  }
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 100) {
    const chunk = idList.slice(i, i + 100);
    const data = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(id => ({ pk: 'CHALLENGE', sk: id })),
        },
      },
    }));
    for (const item of data.Responses?.[tableName] ?? []) {
      const row = item as {
        id?: string;
        sk?: string;
        metaGame?: string;
        ladderId?: string;
        challenger?: { id: string };
        challengees?: { id: string }[];
      };
      if (row.ladderId !== ladderId) {
        continue;
      }
      const challengeId = String(row.id ?? row.sk ?? '');
      const metaGame = row.metaGame ?? '';
      const isParty =
        row.challenger?.id === userId
        || (row.challengees ?? []).some(c => c.id === userId);
      if (!isParty) {
        continue;
      }
      try {
        await revokeChallenge(userId, {
          id: challengeId,
          metaGame,
          standing: false,
          comment: '',
        });
      } catch (err) {
        console.warn(`revokePendingLadderChallengesForUser: ${challengeId}`, err);
      }
    }
  }
}
