import type { FeedbackKind } from './types.js';
import {
  USER_PK_PREFIX,
  userVotedSk,
  userWatchSk,
} from './keys.js';

export type FeedbackMineScope = 'submitted' | 'voted' | 'watched';

export function userMineSkPrefixForScope(scope: FeedbackMineScope): string {
  if (scope === 'voted') {
    return 'VOTED#';
  }
  if (scope === 'watched') {
    return 'WATCH#';
  }
  return 'POST#';
}

export function buildUserVotedIndexItem(
  userId: string,
  kind: FeedbackKind,
  createdAt: number,
  postId: string,
): Record<string, unknown> {
  return {
    pk: `${USER_PK_PREFIX}${userId}`,
    sk: userVotedSk(kind, createdAt, postId),
    entityType: 'userVotedIndex',
    id: postId,
    kind,
    createdAt,
  };
}

export function buildUserWatchIndexItem(
  userId: string,
  kind: FeedbackKind,
  createdAt: number,
  postId: string,
): Record<string, unknown> {
  return {
    pk: `${USER_PK_PREFIX}${userId}`,
    sk: userWatchSk(kind, createdAt, postId),
    entityType: 'userWatchIndex',
    id: postId,
    kind,
    createdAt,
  };
}
