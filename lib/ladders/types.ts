import type { LadderDeltaTuning } from './delta.js';
import { DEFAULT_LADDER_DELTA_TUNING } from './delta.js';

export type LadderStatus = 'forming' | 'active' | 'suspended';

export type LadderMembershipStatus = 'active' | 'left';

export type StartingPointsSource = 'rating_low' | 'initial_points_default';

/** Defaults copied onto each `LADDER` row at creation (Phase 0 locks). */
export type LadderTuning = LadderDeltaTuning & {
  paceThresholdHours: number;
  paceMultiplierMax: number;
  maxConcurrentLadderGames: number;
  rematchCooldownDays: number;
  decayAfterDaysNoActiveLadderGames: number;
  decayRatePerDay: number;
  challengeReachPercent: number;
  minActiveMembers: number;
  initialPointsDefault: number;
};

export const DEFAULT_LADDER_TUNING: LadderTuning = {
  ...DEFAULT_LADDER_DELTA_TUNING,
  paceThresholdHours: 12,
  paceMultiplierMax: 1.15,
  maxConcurrentLadderGames: 7,
  rematchCooldownDays: 3,
  decayAfterDaysNoActiveLadderGames: 30,
  decayRatePerDay: 0.005,
  challengeReachPercent: 20,
  minActiveMembers: 4,
  initialPointsDefault: 500,
};

export type LadderRecord = {
  pk: 'LADDER';
  sk: string;
  id: string;
  metaGame: string;
  variants: string[];
  status: LadderStatus;
  creatorId: string;
  minActiveMembers: number;
  activeMemberCount: number;
  activeMemberIds: string[];
  everActivated: boolean;
  dateCreated: number;
  tuning: LadderTuning;
};

export type LadderSeriesRecord = {
  pk: 'LADDERSERIES';
  sk: string;
  ladderId: string;
};

export type LadderPlayerRecord = {
  pk: 'LADDERPLAYER';
  sk: string;
  ladderId: string;
  userid: string;
  points: number;
  membershipStatus: LadderMembershipStatus;
  joinedAt: number;
  lastLadderActivityAt: number;
  lastDecayAt?: number;
  activeLadderGameCount: number;
  startingPoints: number;
  startingPointsSource: StartingPointsSource;
  startingRatingLabel?: string;
  startingRatingLow?: number;
  startingPointsRecordedAt: number;
  startingLadderStatus: LadderStatus;
};

export type LadderGameRecord = {
  pk: 'LADDERGAME';
  sk: string;
  ladderId: string;
  gameId: string;
  settled?: boolean;
  settledAt?: number;
};

export type LadderBoardEntry = {
  userid: string;
  points: number;
  rank: number;
  activeLadderGameCount: number;
};

export type LadderViewerInfo = {
  membershipStatus: LadderMembershipStatus;
  points: number;
  rank?: number;
};
