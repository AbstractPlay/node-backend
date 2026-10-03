import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DashboardGame } from '../dashboardGames.js';
import type { ClockGameSlice } from '../clockElapsed.js';
import { resolveVacationWindow, isVacationScheduled, isVacationStintLive } from './resolve.js';
import type { VacationUserFields, VacationWindow } from './types.js';

export type PlayerVacationDisplayFlags = {
  onVacation: boolean;
  vacationScheduled: boolean;
};

export function playerVacationDisplayFlags(
  fields: VacationUserFields,
  now: number,
): PlayerVacationDisplayFlags {
  return {
    onVacation: isVacationStintLive(fields, now),
    vacationScheduled: isVacationScheduled(fields, now),
  };
}

export function collectPlayerIdsFromGame(game: { players: { id: string }[] }): string[] {
  return game.players.map(p => p.id);
}

export function collectPlayerIdsFromGames(games: DashboardGame[]): string[] {
  const set = new Set<string>();
  for (const game of games) {
    for (const id of collectPlayerIdsFromGame(game)) {
      set.add(id);
    }
  }
  return [...set];
}

export type VacationPlayerState = {
  windows: Map<string, VacationWindow | null>;
  flags: Map<string, PlayerVacationDisplayFlags>;
};

export async function batchGetVacationPlayerState(
  client: DynamoDBDocumentClient,
  tableName: string,
  playerIds: string[],
  now: number,
): Promise<VacationPlayerState> {
  const windows = new Map<string, VacationWindow | null>();
  const flags = new Map<string, PlayerVacationDisplayFlags>();
  const unique = [...new Set(playerIds)];
  await Promise.all(unique.map(async (id) => {
    const data = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: id },
        ProjectionExpression: VACATION_USER_PROJECTION,
      }),
    );
    const fields = data.Item
      ? vacationFieldsFromUserItem(data.Item as Record<string, unknown>)
      : {};
    windows.set(id, resolveVacationWindow(fields, now));
    flags.set(id, playerVacationDisplayFlags(fields, now));
  }));
  return { windows, flags };
}

export async function batchGetVacationWindows(
  client: DynamoDBDocumentClient,
  tableName: string,
  playerIds: string[],
  now: number,
): Promise<Map<string, VacationWindow | null>> {
  const { windows } = await batchGetVacationPlayerState(client, tableName, playerIds, now);
  return windows;
}

export const VACATION_USER_PROJECTION = [
  'vacationQuotaYear',
  'vacationPauseMsUsed',
  'vacationStartsAt',
  'vacationEndsAt',
  'vacationOpenEnded',
  'vacationStintStartedAt',
].join(', ');

export function vacationFieldsFromUserItem(item: Record<string, unknown>): VacationUserFields {
  return {
    vacationQuotaYear: item.vacationQuotaYear as number | undefined,
    vacationPauseMsUsed: item.vacationPauseMsUsed as number | undefined,
    vacationStartsAt: item.vacationStartsAt as number | undefined,
    vacationEndsAt: item.vacationEndsAt as number | undefined,
    vacationOpenEnded: item.vacationOpenEnded as boolean | undefined,
    vacationStintStartedAt: item.vacationStintStartedAt as number | undefined,
  };
}

export function collectOnClockPlayerIds(
  game: Pick<ClockGameSlice, 'players' | 'toMove'>,
): string[] {
  const { toMove } = game;
  if (toMove === undefined || toMove === null || toMove === '') {
    return [];
  }
  const ids: string[] = [];
  if (Array.isArray(toMove)) {
    toMove.forEach((onClock, i) => {
      if (onClock && game.players[i]) {
        ids.push(game.players[i].id);
      }
    });
  } else {
    const idx = parseInt(String(toMove), 10);
    if (!Number.isNaN(idx) && game.players[idx]) {
      ids.push(game.players[idx].id);
    }
  }
  return ids;
}

export function collectOnClockPlayerIdsFromGames(games: DashboardGame[]): string[] {
  const set = new Set<string>();
  for (const game of games) {
    for (const id of collectOnClockPlayerIds(game)) {
      set.add(id);
    }
  }
  return [...set];
}
