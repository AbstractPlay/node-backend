import { DEFAULT_LADDER_TUNING } from '../../lib/ladders/types.js';
import type { LadderPlayerRecord, LadderRecord } from '../../lib/ladders/types.js';

export function ladderPlayerFixture(
  userid: string,
  ladderId: string,
  overrides: Partial<LadderPlayerRecord> = {},
): LadderPlayerRecord {
  return {
    pk: 'LADDERPLAYER',
    sk: `${ladderId}#${userid}`,
    ladderId,
    userid,
    points: 1000,
    membershipStatus: 'active',
    joinedAt: 1,
    lastLadderActivityAt: 1,
    activeLadderGameCount: 1,
    startingPoints: 1000,
    startingPointsSource: 'initial_points_default',
    startingPointsRecordedAt: 1,
    startingLadderStatus: 'forming',
    ...overrides,
  };
}

export function ladderRecordFixture(
  ladderId: string,
  overrides: Partial<LadderRecord> = {},
): LadderRecord {
  return {
    pk: 'LADDER',
    sk: ladderId,
    id: ladderId,
    metaGame: 'amazons',
    variants: [],
    status: 'active',
    creatorId: 'u0',
    minActiveMembers: 4,
    activeMemberCount: 4,
    activeMemberIds: ['u0', 'u1', 'u2', 'u3'],
    everActivated: true,
    dateCreated: 1,
    tuning: DEFAULT_LADDER_TUNING,
    ...overrides,
  };
}
