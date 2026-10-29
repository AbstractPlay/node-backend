import type { ArenaClockSnapshot } from '../../gamePlayMode.js';
import type { ArenaTableIndexState, ArenaTableState } from './constants.js';

export type ArenaTableSeat = {
  userId: string;
  seatIndex: 0 | 1;
  ready: boolean;
};

export type ArenaTableRecord = {
  pk: 'ARENATABLE';
  sk: string;
  tableId: string;
  state: ArenaTableState;
  indexState: ArenaTableIndexState;
  metaGame: string;
  variants: string[];
  arenaTcId: string;
  arenaClock: ArenaClockSnapshot;
  open: boolean;
  inviteUserId?: string;
  hostId: string;
  seats: ArenaTableSeat[];
  swapProposalUserId?: string;
  createdAt: number;
  updatedAt: number;
  gameStartedAt?: number;
};

export type ArenaTableListItem = {
  tableId: string;
  metaGame: string;
  variants: string[];
  arenaTcId: string;
  open: boolean;
  hostId: string;
  inviteUserId?: string;
  seatUserIds: string[];
  updatedAt: number;
  gameStartedAt?: number;
  state: ArenaTableIndexState;
};
