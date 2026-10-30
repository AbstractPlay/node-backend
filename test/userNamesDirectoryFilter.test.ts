import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PLAYER_DIRECTORY_MS,
  filterActiveUserDirectoryRows,
  parseUserNamesAllFlag,
} from '../lib/playerActivityWindow.js';

const NOW = 1_700_000_000_000;

describe('parseUserNamesAllFlag', () => {
  it('accepts boolean and string truthy forms', () => {
    expect(parseUserNamesAllFlag(true)).toBe(true);
    expect(parseUserNamesAllFlag('true')).toBe(true);
    expect(parseUserNamesAllFlag('1')).toBe(true);
  });

  it('rejects falsey values', () => {
    expect(parseUserNamesAllFlag(false)).toBe(false);
    expect(parseUserNamesAllFlag(undefined)).toBe(false);
    expect(parseUserNamesAllFlag('false')).toBe(false);
  });
});

describe('filterActiveUserDirectoryRows', () => {
  const rows = [
    { id: 'a', lastSeen: NOW },
    { id: 'b', lastSeen: NOW - 10 * 24 * 60 * 60 * 1000 },
    { id: 'c', lastSeen: NOW - ACTIVE_PLAYER_DIRECTORY_MS - 1 },
    { id: 'd' },
  ];

  it('returns all rows when all is true', () => {
    expect(filterActiveUserDirectoryRows(rows, { all: true, now: NOW })).toHaveLength(4);
  });

  it('keeps rows within 30 days only', () => {
    const filtered = filterActiveUserDirectoryRows(rows, { all: false, now: NOW });
    expect(filtered.map(r => r.id)).toEqual(['a', 'b']);
  });
});
