import { GetCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { planCancelScheduled, planStopVacation } from './finalize.js';
import { finalizeVacationIfNeeded } from './persist.js';
import { buildVacationSnapshot } from './resolve.js';
import type { VacationSnapshot, VacationUserFields, VacationValidationError } from './types.js';
import { vacationFieldsFromUserItem, VACATION_USER_PROJECTION } from './load.js';
import { vacationSchedulePolicyError } from './policy.js';
import { syncUsersDirectoryOnVacation } from './publicMirror.js';
import {
  validateSchedule,
  validateStop,
  validateUpdate,
} from './validate.js';

export type VacationMutationResult =
  | { ok: true; vacation: VacationSnapshot }
  | { ok: false; code: VacationValidationError };

function isConditionalFailure(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'ConditionalCheckFailedException';
}

async function loadVacationFields(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<VacationUserFields | null> {
  const data = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ProjectionExpression: VACATION_USER_PROJECTION,
    }),
  );
  if (!data.Item) {
    return null;
  }
  return vacationFieldsFromUserItem(data.Item as Record<string, unknown>);
}

async function readFieldsAfterFinalize(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now: number,
): Promise<VacationUserFields | null> {
  await finalizeVacationIfNeeded(client, tableName, userId, now);
  return loadVacationFields(client, tableName, userId);
}

async function success(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  fields: VacationUserFields,
  now: number,
): Promise<VacationMutationResult> {
  await syncUsersDirectoryOnVacation(client, tableName, userId, fields, now);
  return { ok: true, vacation: buildVacationSnapshot(fields, now) };
}

function failure(code: VacationValidationError): VacationMutationResult {
  return { ok: false, code };
}

function stintStartForWrite(startsAt: number, now: number): number | undefined {
  return now >= startsAt ? Math.max(startsAt, now) : undefined;
}

export type ScheduleVacationPars = {
  startsAt: number;
  endsAt?: number | null;
  openEnded: boolean;
};

export async function scheduleVacation(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  pars: ScheduleVacationPars,
  now: number,
): Promise<VacationMutationResult> {
  const fields = await readFieldsAfterFinalize(client, tableName, userId, now);
  if (!fields) {
    return failure('vacation_invalid_range');
  }
  const policyErr = vacationSchedulePolicyError({ userId });
  if (policyErr) {
    return failure(policyErr);
  }
  const err = validateSchedule({
    startsAt: pars.startsAt,
    endsAt: pars.endsAt,
    openEnded: pars.openEnded,
    fields,
    now,
  });
  if (err) {
    return failure(err);
  }

  const sets: string[] = [
    'vacationStartsAt = :startsAt',
    'vacationOpenEnded = :openEnded',
  ];
  const removes: string[] = [];
  const values: Record<string, unknown> = {
    ':startsAt': pars.startsAt,
    ':openEnded': pars.openEnded,
  };

  if (pars.openEnded) {
    removes.push('vacationEndsAt');
  } else {
    sets.push('vacationEndsAt = :endsAt');
    values[':endsAt'] = pars.endsAt;
  }

  const stintStart = stintStartForWrite(pars.startsAt, now);
  if (stintStart !== undefined) {
    sets.push('vacationStintStartedAt = :stintStart');
    values[':stintStart'] = stintStart;
  } else {
    removes.push('vacationStintStartedAt');
  }

  let updateExpression = `SET ${sets.join(', ')}`;
  if (removes.length > 0) {
    updateExpression += ` REMOVE ${removes.join(', ')}`;
  }

  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        ConditionExpression: 'attribute_not_exists(vacationStartsAt)',
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
      }),
    );
  } catch (e: unknown) {
    if (isConditionalFailure(e)) {
      return failure('vacation_stint_active');
    }
    throw e;
  }

  const after = await loadVacationFields(client, tableName, userId);
  return success(client, tableName, userId, after ?? fields, now);
}

export type UpdateVacationPars = {
  startsAt?: number;
  endsAt?: number | null;
  openEnded?: boolean;
};

export async function updateVacation(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  pars: UpdateVacationPars,
  now: number,
): Promise<VacationMutationResult> {
  const fields = await readFieldsAfterFinalize(client, tableName, userId, now);
  if (!fields || fields.vacationStartsAt === undefined) {
    return failure('vacation_not_scheduled');
  }
  const err = validateUpdate({
    startsAt: pars.startsAt,
    endsAt: pars.endsAt,
    openEnded: pars.openEnded,
    fields,
    now,
  });
  if (err) {
    return failure(err);
  }

  const openEnded = pars.openEnded ?? fields.vacationOpenEnded === true;
  const startsAt = pars.startsAt ?? fields.vacationStartsAt;
  const expectedStartsAt = fields.vacationStartsAt;

  const sets: string[] = [
    'vacationStartsAt = :startsAt',
    'vacationOpenEnded = :openEnded',
  ];
  const removes: string[] = [];
  const values: Record<string, unknown> = {
    ':startsAt': startsAt,
    ':openEnded': openEnded,
    ':expectedStartsAt': expectedStartsAt,
  };

  if (openEnded) {
    removes.push('vacationEndsAt');
  } else {
    const endsAt = pars.endsAt ?? fields.vacationEndsAt;
    sets.push('vacationEndsAt = :endsAt');
    values[':endsAt'] = endsAt;
  }

  if (now < startsAt) {
    removes.push('vacationStintStartedAt');
  }

  let updateExpression = `SET ${sets.join(', ')}`;
  if (removes.length > 0) {
    updateExpression += ` REMOVE ${removes.join(', ')}`;
  }

  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        ConditionExpression: 'vacationStartsAt = :expectedStartsAt',
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
      }),
    );
  } catch (e: unknown) {
    if (isConditionalFailure(e)) {
      return failure('vacation_not_scheduled');
    }
    throw e;
  }

  const after = await loadVacationFields(client, tableName, userId);
  return success(client, tableName, userId, after ?? fields, now);
}

export async function stopVacation(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  now: number,
): Promise<VacationMutationResult> {
  const fields = await readFieldsAfterFinalize(client, tableName, userId, now);
  if (!fields) {
    return failure('vacation_nothing_to_stop');
  }
  const err = validateStop(fields, now);
  if (err) {
    return failure(err);
  }

  const cancel = planCancelScheduled(fields, now);
  if (cancel) {
    try {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: 'USER', sk: userId },
          ConditionExpression: 'vacationStartsAt = :startsAt',
          UpdateExpression:
            'REMOVE vacationStartsAt, vacationEndsAt, vacationOpenEnded, vacationStintStartedAt',
          ExpressionAttributeValues: {
            ':startsAt': fields.vacationStartsAt,
          },
        }),
      );
    } catch (e: unknown) {
      if (isConditionalFailure(e)) {
        return failure('vacation_nothing_to_stop');
      }
      throw e;
    }
    const after = await loadVacationFields(client, tableName, userId);
    return success(client, tableName, userId, after ?? {}, now);
  }

  const stop = planStopVacation(fields, now);
  if (!stop) {
    return failure('vacation_nothing_to_stop');
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
          ':used': stop.vacationPauseMsUsed,
          ':year': stop.vacationQuotaYear,
        },
      }),
    );
  } catch (e: unknown) {
    if (isConditionalFailure(e)) {
      return failure('vacation_nothing_to_stop');
    }
    throw e;
  }

  const after = await loadVacationFields(client, tableName, userId);
  return success(client, tableName, userId, after ?? {}, now);
}
