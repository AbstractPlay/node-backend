import { describe, expect, it } from 'vitest';
import { rankLadderMembers } from '../../lib/ladders/rank.js';

describe('rankLadderMembers', () => {
  it('orders by points then joinedAt then userid', () => {
    const ranks = rankLadderMembers([
      { userid: 'b', points: 100, joinedAt: 2, membershipStatus: 'active' },
      { userid: 'a', points: 100, joinedAt: 1, membershipStatus: 'active' },
      { userid: 'c', points: 200, joinedAt: 3, membershipStatus: 'active' },
      { userid: 'left', points: 999, joinedAt: 0, membershipStatus: 'left' },
    ]);
    expect(ranks.get('c')).toBe(1);
    expect(ranks.get('a')).toBe(2);
    expect(ranks.get('b')).toBe(3);
    expect(ranks.get('left')).toBeUndefined();
  });
});
