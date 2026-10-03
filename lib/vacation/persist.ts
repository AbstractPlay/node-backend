import { GetCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { planFinalizeStint } from './finalize.js';
import { batchGetVacationPlayerState, vacationFieldsFromUserItem, VACATION_USER_PROJECTION } from './load.js';
import type { PlayerVacationDisplayFlags } from './load.js';
import { buildVacationSnapshot } from './resolve.js';
import { syncUsersDirectoryOnVacation } from './publicMirror.js';
import type { VacationSnapshot, VacationWindow } from './types.js';

function isConditionalFailure(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'ConditionalCheckFailedException';
}

export async function finalizeVacationIfNeeded(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now: number,
): Promise<boolean> {
  const data = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ProjectionExpression: VACATION_USER_PROJECTION,
    }),
  );
  if (!data.Item) {
    return false;
  }
  const fields = vacationFieldsFromUserItem(data.Item as Record<string, unknown>);
  const plan = planFinalizeStint(fields, now);
  if (!plan) {
    return false;
  }
  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        ConditionExpression: 'vacationStartsAt = :startsAt',
        UpdateExpression:
          'SET vacationPauseMsUsed = :used, vacationQuotaYear = :year '
          + 'REMOVE vacationStartsAt, vacationEndsAt, vacationOpenEnded, vacationStintStartedAt',
        ExpressionAttributeValues: {
          ':startsAt': fields.vacationStartsAt,
          ':used': plan.vacationPauseMsUsed,
          ':year': plan.vacationQuotaYear,
        },
      }),
    );
  } catch (err: unknown) {
    if (isConditionalFailure(err)) {
      return false;
    }
    throw err;
  }
  const reloaded = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ProjectionExpression: VACATION_USER_PROJECTION,
    }),
  );
  const fieldsAfter = reloaded.Item
    ? vacationFieldsFromUserItem(reloaded.Item as Record<string, unknown>)
    : fields;
  await syncUsersDirectoryOnVacation(client, tableName, userId, fieldsAfter, now);
  return true;
}

export async function readVacationSnapshot(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now: number,
): Promise<VacationSnapshot> {
  await finalizeVacationIfNeeded(client, tableName, userId, now);
  const data = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ProjectionExpression: VACATION_USER_PROJECTION,
    }),
  );
  const fields = data.Item
    ? vacationFieldsFromUserItem(data.Item as Record<string, unknown>)
    : {};
  return buildVacationSnapshot(fields, now);
}

export async function prepareVacationPlayerStateForPlayerIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  playerIds: string[],
  now: number,
): Promise<{
  windows: Map<string, VacationWindow | null>;
  flags: Map<string, PlayerVacationDisplayFlags>;
}> {
  const unique = [...new Set(playerIds)];
  await Promise.all(unique.map(id => finalizeVacationIfNeeded(client, tableName, id, now)));
  return batchGetVacationPlayerState(client, tableName, unique, now);
}

export function getPlayerVacationFlagsFromMap(
  map: Map<string, PlayerVacationDisplayFlags>,
): (playerId: string) => PlayerVacationDisplayFlags {
  const empty: PlayerVacationDisplayFlags = { onVacation: false, vacationScheduled: false };
  return (playerId: string) => map.get(playerId) ?? empty;
}

export async function prepareVacationWindowsForPlayerIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  playerIds: string[],
  now: number,
): Promise<Map<string, VacationWindow | null>> {
  const { windows } = await prepareVacationPlayerStateForPlayerIds(client, tableName, playerIds, now);
  return windows;
}

export type GetVacationWindowFn = (playerId: string) => VacationWindow | null;

export function getVacationWindowFromMap(
  map: Map<string, VacationWindow | null>,
): GetVacationWindowFn {
  return (playerId: string) => map.get(playerId) ?? null;
}
