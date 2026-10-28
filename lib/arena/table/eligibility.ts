import { gameinfo } from '@abstractplay/gameslib';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { tournamentPlaySupported } from '../../tournamentGame.js';
import { getArenaTimeControl } from '../timeControls.js';
import { getArenaUserTableId } from './store.js';

export type ArenaEligibilityResult = { ok: true } | { ok: false; message: string };

export function assertMetaGameArenaEligible(metaGame: string): ArenaEligibilityResult {
  if (!tournamentPlaySupported(metaGame)) {
    return { ok: false, message: `Meta-game ${metaGame} does not support 2-player arena.` };
  }
  const info = gameinfo.get(metaGame);
  if (!info?.playercounts.includes(2)) {
    return { ok: false, message: 'Arena is 2-player only for this title.' };
  }
  return { ok: true };
}

export function assertArenaTcId(tcId: string): ArenaEligibilityResult {
  const tc = getArenaTimeControl(tcId);
  if (!tc?.enabled) {
    return { ok: false, message: `Unknown or disabled arena time control ${tcId}.` };
  }
  return { ok: true };
}

export async function assertUserFreeForArenaTable(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<ArenaEligibilityResult> {
  const existing = await getArenaUserTableId(client, tableName, userId);
  if (existing !== undefined) {
    return { ok: false, message: 'You already have an active arena table or game.' };
  }
  return { ok: true };
}

export function seatUserIds(table: { seats: { userId: string }[] }): string[] {
  return table.seats.map((s) => s.userId).filter((id) => id.length > 0);
}

export function isSeatedOnTable(table: { seats: { userId: string }[] }, userId: string): boolean {
  return table.seats.some((s) => s.userId === userId);
}
