import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  challengeMatchesStandingEntry,
  type ChallengeForStandingMatch,
  type StandingPresetEntry,
} from './standingChallengeMatch.js';

type RealStandingRec = {
  pk: 'REALSTANDING';
  sk: string;
  standing: StandingPresetEntry[];
};

export async function pauseMatchingRealStandingEntries(
  client: DynamoDBDocumentClient,
  tableName: string,
  issuerId: string,
  challenge: ChallengeForStandingMatch,
): Promise<number> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'REALSTANDING', sk: issuerId },
  }));
  if (data.Item === undefined) {
    return 0;
  }
  const rec = data.Item as RealStandingRec;
  let paused = 0;
  const standing = rec.standing.map(entry => {
    if (challengeMatchesStandingEntry(challenge, entry)) {
      if (!entry.suspended) {
        paused += 1;
      }
      return { ...entry, suspended: true };
    }
    return entry;
  });
  if (paused === 0) {
    return 0;
  }
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: 'REALSTANDING',
      sk: issuerId,
      standing,
    },
  }));
  return paused;
}
