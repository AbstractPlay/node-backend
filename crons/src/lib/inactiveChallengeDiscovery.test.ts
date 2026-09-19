import { describe, expect, it } from 'vitest';
import {
  filterRevokeCandidates,
  isInactiveLastSeen,
  isValidUserId,
} from './inactiveChallengeDiscovery.js';

describe('isValidUserId', () => {
  it('rejects empty ids', () => {
    expect(isValidUserId('')).toBe(false);
    expect(isValidUserId('u1')).toBe(true);
  });
});

describe('isInactiveLastSeen', () => {
  it('treats missing lastSeen as active', () => {
    expect(isInactiveLastSeen(undefined, 100)).toBe(false);
    expect(isInactiveLastSeen('bad', 100)).toBe(false);
  });

  it('flags old lastSeen as inactive', () => {
    expect(isInactiveLastSeen(50, 100)).toBe(true);
    expect(isInactiveLastSeen(150, 100)).toBe(false);
  });
});

describe('filterRevokeCandidates', () => {
  const inactiveSet = new Set(['u-inactive']);

  it('returns standing and direct challenges from inactive issuers only', () => {
    const candidates = filterRevokeCandidates(
      [{
        id: 's1',
        metaGame: 'chess',
        challenger: { id: 'u-inactive' },
      }],
      [{
        id: 'd1',
        metaGame: 'go',
        challenger: { id: 'u-active' },
      }, {
        id: 'd2',
        metaGame: 'go',
        challenger: { id: 'u-inactive' },
      }],
      inactiveSet,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.map(c => c.id).sort()).toEqual(['d2', 's1']);
  });
});
