import { ARENA_INDEX_TIME_MAX_MS } from './constants.js';

export function arenaTableSk(tableId: string): string {
  return tableId;
}

export function arenaIndexPk(state: 'waiting' | 'seated' | 'playing'): string {
  return `ARENAINDEX#${state}`;
}

export function arenaIndexSk(updatedAtMs: number, tableId: string): string {
  const inverted = String(ARENA_INDEX_TIME_MAX_MS - updatedAtMs).padStart(13, '0');
  return `${inverted}#${tableId}`;
}

export function arenaUserSk(userId: string): string {
  return userId;
}

/** Queue partition key for quick match (meta + tc + variants). */
export function arenaQueuePk(metaGame: string, arenaTcId: string, variants: string[]): string {
  const v = [...variants].sort().join(',');
  return `ARENAQUEUE#${metaGame}#${arenaTcId}#${v}`;
}

export function arenaQueueSk(userId: string): string {
  return userId;
}
