/** Humans active within this window match green + yellow activity markers (30 days). */
export const ACTIVE_PLAYER_DIRECTORY_MS = 30 * 24 * 60 * 60 * 1000;

export function parseUserNamesAllFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined || value === null) {
    return false;
  }
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1';
}

export type UserDirectoryRow = {
  lastSeen?: unknown;
};

/** When `all` is false, keep humans seen within ACTIVE_PLAYER_DIRECTORY_MS. */
export function filterActiveUserDirectoryRows<T extends UserDirectoryRow>(
  items: T[],
  opts: { all: boolean; now?: number },
): T[] {
  if (opts.all) {
    return items;
  }
  const now = opts.now ?? Date.now();
  const cutoff = now - ACTIVE_PLAYER_DIRECTORY_MS;
  return items.filter(
    item => typeof item.lastSeen === 'number' && item.lastSeen >= cutoff,
  );
}
