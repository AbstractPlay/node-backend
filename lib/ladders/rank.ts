import type { LadderPlayerRecord } from './types.js';

export type RankableMember = Pick<LadderPlayerRecord, 'userid' | 'points' | 'joinedAt' | 'membershipStatus'>;

/** Higher rank = 1. Ties: earlier join, then userid lexicographic. */
export function rankLadderMembers(members: RankableMember[]): Map<string, number> {
  const active = members.filter((m) => m.membershipStatus === 'active');
  const sorted = [...active].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (a.joinedAt !== b.joinedAt) {
      return a.joinedAt - b.joinedAt;
    }
    return a.userid.localeCompare(b.userid);
  });
  const ranks = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    ranks.set(sorted[i]!.userid, i + 1);
  }
  return ranks;
}
