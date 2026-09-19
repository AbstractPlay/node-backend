/**
 * Keep in sync with node-backend removeAChallenge (api/abstractplay.ts) for revocation paths.
 */
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { adjustShardedCounts } from './shardedMetaGameCounts.js';
import { isBotId, isValidUserId } from './inactiveChallengeDiscovery.js';

export type ChallengePlayer = { id: string; name?: string };

export type RevokeChallengeRecord = {
  id: string;
  metaGame: string;
  numPlayers: number;
  challenger: ChallengePlayer;
  challengees?: ChallengePlayer[];
  players?: ChallengePlayer[];
};

export async function revokeChallengeRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  challenge: RevokeChallengeRecord,
  standing: boolean,
): Promise<void> {
  const work: Promise<unknown>[] = [];

  if (!standing) {
    work.push(client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: challenge.challenger.id },
      UpdateExpression: 'DELETE challenges_issued :c',
      ExpressionAttributeValues: { ':c': new Set([challenge.id]) },
    })));
    for (const challengee of challenge.challengees ?? []) {
      if (!isValidUserId(challengee.id)) {
        continue;
      }
      if (!(await isBotId(client, tableName, challengee.id))) {
        work.push(client.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk: 'USER', sk: challengee.id },
          UpdateExpression: 'DELETE challenges_received :c',
          ExpressionAttributeValues: { ':c': new Set([challenge.id]) },
        })));
      }
    }
  } else {
    work.push(client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: challenge.challenger.id },
      UpdateExpression: 'DELETE challenges_standing :c',
      ExpressionAttributeValues: { ':c': new Set([`${challenge.metaGame}#${challenge.id}`]) },
    })));
  }

  const acceptors = (challenge.players ?? []).filter(
    p => isValidUserId(p.id) && p.id !== challenge.challenger.id,
  );
  for (const player of acceptors) {
    if (await isBotId(client, tableName, player.id)) {
      continue;
    }
    work.push(client.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: player.id },
      UpdateExpression: 'DELETE challenges_accepted :c',
      ExpressionAttributeValues: {
        ':c': new Set([standing ? `${challenge.metaGame}#${challenge.id}` : challenge.id]),
      },
    })));
  }

  if (!standing) {
    work.push(client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: 'CHALLENGE', sk: challenge.id },
    })));
  } else {
    work.push(client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `STANDINGCHALLENGE#${challenge.metaGame}`, sk: challenge.id },
    })));
    work.push(adjustShardedCounts(client, tableName, challenge.metaGame, { standingchallenges: -1 }));
  }

  await Promise.all(work);
}
