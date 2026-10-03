import { ddbDocClient } from '../ddb.js';
import { formatReturnError, headers, logGetItemError } from '../api/http.js';
import type { LambdaHttpResponse } from '../api/http.js';
import type { VacationValidationError } from './types.js';
import {
  scheduleVacation,
  stopVacation,
  updateVacation,
} from './mutations.js';

function vacationClientError(code: VacationValidationError): LambdaHttpResponse {
  return {
    statusCode: 400,
    body: JSON.stringify({ message: code }),
    headers,
  };
}

function parseEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export type ScheduleVacationAuthPars = {
  startsAt?: unknown;
  endsAt?: unknown;
  openEnded?: boolean;
};

export async function scheduleVacationAuth(userId: string, pars: ScheduleVacationAuthPars) {
  const startsAt = parseEpochMs(pars.startsAt);
  if (startsAt === undefined) {
    return formatReturnError('startsAt is required (ms epoch or ISO-8601).');
  }
  const openEnded = pars.openEnded === true;
  const endsAtRaw = pars.endsAt;
  const endsAt = endsAtRaw === null || endsAtRaw === undefined
    ? undefined
    : parseEpochMs(endsAtRaw);

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const now = Date.now();
  try {
    const result = await scheduleVacation(
      ddbDocClient,
      tableName,
      userId,
      { startsAt, endsAt, openEnded },
      now,
    );
    if (!result.ok) {
      return vacationClientError(result.code);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ vacation: result.vacation }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to schedule vacation for ${userId}`);
  }
}

export type UpdateVacationAuthPars = {
  startsAt?: unknown;
  endsAt?: unknown;
  openEnded?: boolean;
};

export async function updateVacationAuth(userId: string, pars: UpdateVacationAuthPars) {
  const startsAt = pars.startsAt === undefined ? undefined : parseEpochMs(pars.startsAt);
  if (pars.startsAt !== undefined && startsAt === undefined) {
    return formatReturnError('startsAt must be ms epoch or ISO-8601.');
  }
  const endsAt = pars.endsAt === undefined
    ? undefined
    : pars.endsAt === null
      ? null
      : parseEpochMs(pars.endsAt);
  if (pars.endsAt !== undefined && pars.endsAt !== null && endsAt === undefined) {
    return formatReturnError('endsAt must be ms epoch or ISO-8601.');
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const now = Date.now();
  try {
    const result = await updateVacation(
      ddbDocClient,
      tableName,
      userId,
      {
        startsAt,
        endsAt,
        openEnded: pars.openEnded,
      },
      now,
    );
    if (!result.ok) {
      return vacationClientError(result.code);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ vacation: result.vacation }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update vacation for ${userId}`);
  }
}

export async function stopVacationAuth(userId: string) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const now = Date.now();
  try {
    const result = await stopVacation(ddbDocClient, tableName, userId, now);
    if (!result.ok) {
      return vacationClientError(result.code);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ vacation: result.vacation }),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to stop vacation for ${userId}`);
  }
}
