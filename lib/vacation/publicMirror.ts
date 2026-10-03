import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildVacationSnapshot, isVacationStintLive } from './resolve.js';
import type { VacationUserFields } from './types.js';

/** Public vacation detail returned from `player_about` (not on `user_names`). */
export type PlayerAboutVacation = {
  onVacation: boolean;
  vacationScheduled: boolean;
  vacationActive: boolean;
  vacationOpenEnded: boolean;
  vacationStartsAt?: number;
  vacationEndsAt?: number;
  vacationBlocksRemaining: number;
  vacationQuotaMsRemaining: number;
};

export function buildPlayerAboutVacation(
  fields: VacationUserFields,
  now: number,
): PlayerAboutVacation | undefined {
  if (fields.vacationStartsAt === undefined) {
    return undefined;
  }
  const snap = buildVacationSnapshot(fields, now);
  return {
    onVacation: isVacationStintLive(fields, now),
    vacationScheduled: snap.vacationScheduled,
    vacationActive: snap.vacationActive,
    vacationOpenEnded: snap.vacationOpenEnded,
    vacationStartsAt: snap.vacationStartsAt,
    vacationEndsAt: snap.vacationEndsAt,
    vacationBlocksRemaining: snap.vacationBlocksRemaining,
    vacationQuotaMsRemaining: snap.vacationQuotaMsRemaining,
  };
}

/** Mirror live stint to public `USERS` row for `user_names` (binary indicator). */
export async function syncUsersDirectoryOnVacation(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  fields: VacationUserFields,
  now: number,
): Promise<void> {
  const onVacation = isVacationStintLive(fields, now);
  if (onVacation) {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USERS', sk: userId },
        UpdateExpression: 'SET onVacation = :true',
        ExpressionAttributeValues: { ':true': true },
      }),
    );
    return;
  }
  await client.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'USERS', sk: userId },
      UpdateExpression: 'REMOVE onVacation',
    }),
  );
}
