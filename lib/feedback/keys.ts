import type { FeedbackKind, FeedbackListSort } from './types.js';

export const POST_PK_PREFIX = 'POST#';
export const USER_PK_PREFIX = 'USER#';
export const HISTORY_PK_PREFIX = 'HISTORY#';
export const POSTID_PK_PREFIX = 'POSTID#';
export const HISTORY_LOOKUP_SK = 'SUMMARY';

export function postPk(id: string): string {
  return `${POST_PK_PREFIX}${id}`;
}

export function metaSk(): 'META' {
  return 'META';
}

export function commentSk(createdAt: number, commentId: string): string {
  return `COMMENT#${createdAt}#${commentId}`;
}

export function editSk(createdAt: number, editId: string): string {
  return `EDIT#${createdAt}#${editId}`;
}

export function userPostsSkPrefix(): string {
  return 'POST#';
}

export function voteSk(userId: string): string {
  return `VOTE#${userId}`;
}

export function subscribeSk(userId: string): string {
  return `SUB#${userId}`;
}

export function userIndexSk(kind: FeedbackKind, createdAt: number, id: string): string {
  return `POST#${kind}#${createdAt}#${id}`;
}

export function kindGsi1Pk(kind: FeedbackKind): string {
  return `KIND#${kind}`;
}

export function statusGsi2Pk(kind: FeedbackKind, status: string): string {
  return `STATUS#${kind}#${status}`;
}

function padNumber(value: number, width: number): string {
  const safe = Math.max(0, Math.floor(value));
  return String(safe).padStart(width, '0');
}

export function listVotesGsi1Sk(effectiveVotes: number, createdAt: number, id: string): string {
  return `VOTES#${padNumber(effectiveVotes, 10)}#${createdAt}#${id}`;
}

export function listRecentGsi1Sk(createdAt: number, id: string): string {
  return `RECENT#${padNumber(createdAt, 13)}#${id}`;
}

export function listUpdatedGsi1Sk(updatedAt: number, id: string): string {
  return `UPDATED#${padNumber(updatedAt, 13)}#${id}`;
}

export function listSkForSort(sort: FeedbackListSort): `LIST#${'VOTES' | 'RECENT' | 'UPDATED'}` {
  if (sort === 'votes') {
    return 'LIST#VOTES';
  }
  if (sort === 'recent') {
    return 'LIST#RECENT';
  }
  return 'LIST#UPDATED';
}

export function listGsi1SkForSort(
  sort: FeedbackListSort,
  effectiveVotes: number,
  createdAt: number,
  updatedAt: number,
  id: string,
): string {
  if (sort === 'votes') {
    return listVotesGsi1Sk(effectiveVotes, createdAt, id);
  }
  if (sort === 'recent') {
    return listRecentGsi1Sk(createdAt, id);
  }
  return listUpdatedGsi1Sk(updatedAt, id);
}

export function historyPk(kind: FeedbackKind): string {
  return `${HISTORY_PK_PREFIX}${kind}`;
}

export function historySk(closedAt: number, id: string): string {
  return `${closedAt}#${id}`;
}

export function postIdLookupPk(id: string): string {
  return `${POSTID_PK_PREFIX}${id}`;
}

export function listSortPrefix(sort: FeedbackListSort): string {
  if (sort === 'votes') {
    return 'VOTES#';
  }
  if (sort === 'recent') {
    return 'RECENT#';
  }
  return 'UPDATED#';
}
