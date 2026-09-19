import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  queryAllDirectChallenges,
  queryAllStandingChallenges,
  type OpenChallengeRecord,
} from './standingChallengeQueries.js';

export type RevokeCandidate = {
  kind: 'standing' | 'direct';
  metaGame: string;
  id: string;
  issuerId: string;
  challenge: OpenChallengeRecord;
};

export type DiscoveryResult = {
  inactiveUsers: number;
  openChallengesScanned: number;
  candidates: RevokeCandidate[];
};

export function isInactiveLastSeen(lastSeen: unknown, inactiveBeforeMs: number): boolean {
  return typeof lastSeen === 'number' && lastSeen < inactiveBeforeMs;
}

export async function buildInactiveIssuerSet(
  client: DynamoDBDocumentClient,
  tableName: string,
  inactiveBeforeMs: number,
): Promise<Set<string>> {
  const inactive = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': 'USERS' },
      ProjectionExpression: 'sk, lastSeen',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      const userId = item.sk;
      if (typeof userId === 'string' && isInactiveLastSeen(item.lastSeen, inactiveBeforeMs)) {
        inactive.add(userId);
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey !== undefined);
  return inactive;
}

function challengeId(item: OpenChallengeRecord): string | undefined {
  if (typeof item.id === 'string') {
    return item.id;
  }
  if (typeof item.sk === 'string') {
    return item.sk;
  }
  return undefined;
}

function toCandidate(
  kind: 'standing' | 'direct',
  item: OpenChallengeRecord,
  inactiveSet: Set<string>,
): RevokeCandidate | undefined {
  const issuerId = item.challenger?.id;
  const id = challengeId(item);
  const metaGame = item.metaGame;
  if (typeof issuerId !== 'string' || typeof id !== 'string' || typeof metaGame !== 'string') {
    return undefined;
  }
  if (!inactiveSet.has(issuerId)) {
    return undefined;
  }
  return { kind, metaGame, id, issuerId, challenge: item };
}

export function filterRevokeCandidates(
  standingChallenges: OpenChallengeRecord[],
  directChallenges: OpenChallengeRecord[],
  inactiveSet: Set<string>,
): RevokeCandidate[] {
  const candidates: RevokeCandidate[] = [];
  for (const item of standingChallenges) {
    const candidate = toCandidate('standing', item, inactiveSet);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  for (const item of directChallenges) {
    const candidate = toCandidate('direct', item, inactiveSet);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

export async function discoverInactiveIssuerChallenges(
  client: DynamoDBDocumentClient,
  tableName: string,
  inactiveBeforeMs: number,
): Promise<DiscoveryResult> {
  const inactiveSet = await buildInactiveIssuerSet(client, tableName, inactiveBeforeMs);
  const [standingChallenges, directChallenges] = await Promise.all([
    queryAllStandingChallenges(client, tableName),
    queryAllDirectChallenges(client, tableName),
  ]);
  const candidates = filterRevokeCandidates(standingChallenges, directChallenges, inactiveSet);
  return {
    inactiveUsers: inactiveSet.size,
    openChallengesScanned: standingChallenges.length + directChallenges.length,
    candidates,
  };
}

export async function issuerStillInactive(
  client: DynamoDBDocumentClient,
  tableName: string,
  issuerId: string,
  inactiveBeforeMs: number,
): Promise<boolean> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USERS', sk: issuerId },
    ProjectionExpression: 'lastSeen',
  }));
  if (data.Item === undefined) {
    return false;
  }
  return isInactiveLastSeen(data.Item.lastSeen, inactiveBeforeMs);
}

export function isValidUserId(userId: string): boolean {
  return userId.length > 0;
}

export async function isBotId(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<boolean> {
  if (!isValidUserId(userId)) {
    return false;
  }
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'BOT', sk: userId },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  return data.Item !== undefined;
}
