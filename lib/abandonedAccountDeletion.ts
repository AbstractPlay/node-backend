import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { hasRegisteredDisplayName } from './userDisplayName.js';
import { isBotIdOnTable } from './participants.js';
import { ARENA_USER_PK } from './arena/table/constants.js';
import { tournamentByUserPk } from './tournaments/byUserIndex.js';
import { ladderByUserPk } from './ladders/keys.js';
import {
  queryAllDirectChallenges,
  queryAllStandingChallenges,
} from './openChallengeQueries.js';

export type EligibilityResult =
  | { ok: true }
  | { ok: false; reason: string };

const DEFAULT_INACTIVE_MS = 365 * 24 * 60 * 60 * 1000;

export function inactiveBeforeMsFromEnv(now = Date.now()): number {
  const raw = process.env.ABANDONED_ACCOUNT_INACTIVE_MS;
  const inactiveMs = raw !== undefined && raw !== ''
    ? Number(raw)
    : DEFAULT_INACTIVE_MS;
  return now - inactiveMs;
}

async function queryPartition(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  limit?: number,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
      ...(limit !== undefined ? { Limit: limit } : {}),
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
    if (limit !== undefined) {
      break;
    }
  } while (lastKey);
  return items;
}

async function partitionNonEmpty(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<boolean> {
  const items = await queryPartition(client, tableName, pk, 1);
  return items.length > 0;
}

async function deleteKey(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  sk: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk, sk },
  }));
}

async function deletePartition(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  dryRun: boolean,
): Promise<number> {
  const rows = await queryPartition(client, tableName, pk);
  for (const row of rows) {
    await deleteKey(client, tableName, pk, String(row.sk), dryRun);
  }
  return rows.length;
}

export async function confirmAbandonedAccountEligible(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  inactiveBeforeMs: number,
): Promise<EligibilityResult> {
  if (await isBotIdOnTable(client, tableName, userId)) {
    return { ok: false, reason: 'bot' };
  }

  const user = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'lastSeen, admin',
  }));
  if (user.Item === undefined) {
    return { ok: false, reason: 'missing_user' };
  }
  if (user.Item.admin === true) {
    return { ok: false, reason: 'admin' };
  }
  const lastSeen = user.Item.lastSeen;
  if (typeof lastSeen !== 'number' || lastSeen >= inactiveBeforeMs) {
    return { ok: false, reason: 'active_since_dump' };
  }

  const usersRow = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USERS', sk: userId },
    ProjectionExpression: '#name',
    ExpressionAttributeNames: { '#name': 'name' },
  }));
  if (!hasRegisteredDisplayName(usersRow.Item?.name)) {
    return { ok: false, reason: 'unregistered' };
  }

  if (await partitionNonEmpty(client, tableName, `COMPLETEDGAMES#${userId}`)) {
    return { ok: false, reason: 'completed_game' };
  }
  if (await partitionNonEmpty(client, tableName, `CURRENTGAMES#${userId}`)) {
    return { ok: false, reason: 'current_game' };
  }

  const arena = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ARENA_USER_PK, sk: userId },
    ProjectionExpression: 'pk',
  }));
  if (arena.Item !== undefined) {
    return { ok: false, reason: 'arena_active' };
  }

  return { ok: true };
}

function challengeInvolvesUser(
  item: Record<string, unknown>,
  userId: string,
): boolean {
  const challenger = item.challenger;
  if (challenger && typeof challenger === 'object' && (challenger as { id?: string }).id === userId) {
    return true;
  }
  const challengees = item.challengees;
  if (Array.isArray(challengees)) {
    for (const c of challengees) {
      if (c && typeof c === 'object' && (c as { id?: string }).id === userId) {
        return true;
      }
    }
  }
  return false;
}

export async function userHasOpenChallengeInvolvement(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<boolean> {
  const standing = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'REALSTANDING', sk: userId },
    ProjectionExpression: 'pk',
  }));
  if (standing.Item !== undefined) {
    return true;
  }

  const [standingChallenges, directChallenges] = await Promise.all([
    queryAllStandingChallenges(client, tableName),
    queryAllDirectChallenges(client, tableName),
  ]);
  for (const item of [...standingChallenges, ...directChallenges]) {
    if (challengeInvolvesUser(item, userId)) {
      return true;
    }
  }
  return false;
}

export type DetachProgramsStats = {
  tournamentsDetached: number;
  laddersDetached: number;
  orgEventsDetached: number;
};

export async function detachUserPrograms(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  dryRun: boolean,
): Promise<DetachProgramsStats> {
  const stats: DetachProgramsStats = {
    tournamentsDetached: 0,
    laddersDetached: 0,
    orgEventsDetached: 0,
  };

  const tourRefs = await queryPartition(client, tableName, tournamentByUserPk(userId));
  for (const row of tourRefs) {
    const tournamentId = String(row.sk);
    const playerRows = await queryPartitionWithPrefix(
      client,
      tableName,
      'TOURNAMENTPLAYER',
      `${tournamentId}#`,
    );
    for (const playerRow of playerRows) {
      const sk = String(playerRow.sk);
      if (playerRow.playerid === userId || sk.endsWith(`#${userId}`)) {
        await deleteKey(client, tableName, 'TOURNAMENTPLAYER', sk, dryRun);
      }
    }
    await deleteKey(client, tableName, tournamentByUserPk(userId), tournamentId, dryRun);
    stats.tournamentsDetached += 1;
  }

  const ladderRefs = await queryPartition(client, tableName, ladderByUserPk(userId));
  for (const row of ladderRefs) {
    const ladderId = String(row.sk);
    await deleteKey(client, tableName, ladderByUserPk(userId), ladderId, dryRun);
    await deleteKey(client, tableName, 'LADDERPOOL', `${ladderId}#${userId}`, dryRun);
    await deleteKey(client, tableName, 'LADDERPLAYER', `${ladderId}#${userId}`, dryRun);
    stats.laddersDetached += 1;
  }

  const orgRows = await queryOrgEventPlayersForUser(client, tableName, userId);
  for (const row of orgRows) {
    await deleteKey(client, tableName, 'ORGEVENTPLAYER', String(row.sk), dryRun);
    stats.orgEventsDetached += 1;
  }

  return stats;
}

async function queryOrgEventPlayersForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<Record<string, unknown>[]> {
  const suffix = `#${userId}`;
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      FilterExpression: 'ends_with(#sk, :suffix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'ORGEVENTPLAYER', ':suffix': suffix },
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function deleteBlockingRelations(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  dryRun: boolean,
): Promise<void> {
  const blocked = await queryPartitionWithPrefix(client, tableName, `PLAYER#${userId}`, 'BLOCKED#');
  for (const row of blocked) {
    const otherId = String(row.sk).slice('BLOCKED#'.length);
    await deleteKey(client, tableName, `PLAYER#${userId}`, String(row.sk), dryRun);
    await deleteKey(client, tableName, `PLAYER#${otherId}`, `BLOCKEDBY#${userId}`, dryRun);
  }
  const blockedBy = await queryPartitionWithPrefix(client, tableName, `PLAYER#${userId}`, 'BLOCKEDBY#');
  for (const row of blockedBy) {
    const otherId = String(row.sk).slice('BLOCKEDBY#'.length);
    await deleteKey(client, tableName, `PLAYER#${userId}`, String(row.sk), dryRun);
    await deleteKey(client, tableName, `PLAYER#${otherId}`, `BLOCKED#${userId}`, dryRun);
  }
  await deletePartition(client, tableName, `PLAYER#${userId}`, dryRun);
}

async function queryPartitionWithPrefix(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  skPrefix: string,
): Promise<Record<string, unknown>[]> {
  const params: QueryCommandInput = {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
  };
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({ ...params, ExclusiveStartKey: lastKey }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function deletePushForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  dryRun: boolean,
): Promise<void> {
  const prefix = `${userId}#`;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'PUSH', ':prefix': prefix },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      await deleteKey(client, tableName, 'PUSH', String(item.sk), dryRun);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  await deleteKey(client, tableName, 'PUSH', userId, dryRun);
}

export type DeleteHumanUserDataStats = {
  partitionsDeleted: number;
};

export async function deleteHumanUserData(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  opts?: { dryRun?: boolean; feedbackTableName?: string },
): Promise<DeleteHumanUserDataStats> {
  const dryRun = opts?.dryRun ?? false;
  let partitionsDeleted = 0;

  const partitionPks = [
    `CURRENTGAMES#${userId}`,
    `USERGAME#${userId}`,
    `RECENTCOMPLETED#${userId}`,
    `COMPLETEDGAMES#${userId}`,
    `WATCHED#${userId}`,
    `HIGHLIGHT#${userId}`,
    `NOTIFICATION#${userId}`,
    `RECOMMENDS#${userId}`,
    `LAYOUTEVT#${userId}`,
    `CUSTOMIZATION#${userId}`,
    `PLAYGROUND#${userId}`,
    `ARENAFB#${userId}`,
    `TAG`,
  ];

  for (const pk of partitionPks) {
    if (pk === 'TAG') {
      await deleteKey(client, tableName, 'TAG', userId, dryRun);
      partitionsDeleted += 1;
      continue;
    }
    partitionsDeleted += await deletePartition(client, tableName, pk, dryRun);
  }

  await deletePushForUser(client, tableName, userId, dryRun);
  await deleteKey(client, tableName, 'REALSTANDING', userId, dryRun);
  await deleteKey(client, tableName, ARENA_USER_PK, userId, dryRun);
  await deleteBlockingRelations(client, tableName, userId, dryRun);

  const feedbackTable = opts?.feedbackTableName ?? process.env.FEEDBACK_TABLE;
  if (feedbackTable) {
    partitionsDeleted += await deletePartition(client, feedbackTable, `USER#${userId}`, dryRun);
  }

  if (!dryRun) {
    await client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: 'USERS', sk: userId },
    }));
    await client.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
    }));
  }
  partitionsDeleted += 2;

  return { partitionsDeleted };
}

export async function deleteHumanCognitoUser(
  userPoolId: string,
  userId: string,
  opts?: { dryRun?: boolean },
): Promise<void> {
  if (opts?.dryRun) {
    return;
  }
  const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });
  await cognito.send(new AdminDeleteUserCommand({
    UserPoolId: userPoolId,
    Username: userId,
  }));
}

export async function runAbandonedAccountDeletionForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  opts: {
    inactiveBeforeMs: number;
    userPoolId?: string;
    dryRun?: boolean;
    feedbackTableName?: string;
  },
): Promise<
  | { status: 'deleted'; detach: DetachProgramsStats }
  | { status: 'skipped'; reason: string }
> {
  const eligibility = await confirmAbandonedAccountEligible(
    client,
    tableName,
    userId,
    opts.inactiveBeforeMs,
  );
  if (!eligibility.ok) {
    return { status: 'skipped', reason: eligibility.reason };
  }
  if (await userHasOpenChallengeInvolvement(client, tableName, userId)) {
    return { status: 'skipped', reason: 'open_challenge' };
  }

  const dryRun = opts.dryRun ?? false;
  const detach = await detachUserPrograms(client, tableName, userId, dryRun);
  await deleteHumanUserData(client, tableName, userId, {
    dryRun,
    feedbackTableName: opts.feedbackTableName,
  });

  const userPoolId = opts.userPoolId ?? process.env.USERPOOL_ID;
  if (userPoolId) {
    await deleteHumanCognitoUser(userPoolId, userId, { dryRun });
  } else if (!dryRun) {
    throw new Error('USERPOOL_ID is required for Cognito deletion');
  }

  return { status: 'deleted', detach };
}
