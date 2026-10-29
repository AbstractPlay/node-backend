/** Inverted timestamp prefix for ARENAINDEX# sk (newest first on ascending Query). */
export const ARENA_INDEX_TIME_MAX_MS = 9_999_999_999_999;

export const ARENA_TABLE_PK = 'ARENATABLE';
export const ARENA_USER_PK = 'ARENAUSER';

export type ArenaTableIndexState = 'waiting' | 'seated' | 'playing';

export type ArenaTableState =
  | 'open'
  | 'seated'
  | 'launching'
  | 'playing'
  | 'ended'
  | 'abandoned';
