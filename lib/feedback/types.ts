import type {
  BUG_STATUSES,
  EFFORT_LEVELS,
  FEATURE_STATUSES,
  FEEDBACK_KINDS,
  FEEDBACK_LIST_SORTS,
  WISHLIST_CATEGORIES,
  WISHLIST_STATUSES,
} from './constants.js';

export type FeedbackKind = typeof FEEDBACK_KINDS[number];
export type FeedbackListSort = typeof FEEDBACK_LIST_SORTS[number];
export type BugStatus = typeof BUG_STATUSES[number];
export type FeatureStatus = typeof FEATURE_STATUSES[number];
export type WishlistStatus = typeof WISHLIST_STATUSES[number];
export type FeedbackEffort = typeof EFFORT_LEVELS[number];
export type WishlistCategory = typeof WISHLIST_CATEGORIES[number];

export type FeedbackStatus = BugStatus | FeatureStatus | WishlistStatus;

export type FeedbackBugContext = {
  pageUrl?: string;
  gameId?: string;
  moveNumber?: number;
  layoutId?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  consoleErrors?: { ts: number; level: string; message: string; stack?: string }[];
  capturedError?: { message: string; stack?: string; name?: string };
};

export type FeedbackMetaItem = {
  pk: string;
  sk: 'META';
  entityType: 'meta';
  id: string;
  kind: FeedbackKind;
  title: string;
  body?: string;
  status: FeedbackStatus;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  voteCount: number;
  legacyVoteCount: number;
  effectiveVotes: number;
  commentCount: number;
  attachmentKeys?: string[];
  context?: FeedbackBugContext;
  gameUrl?: string;
  bggGameId?: string;
  normalizedGameUrl?: string;
  legacyBggItemId?: string;
  legacyBggSubmitter?: string;
  legacyDiscordThreadId?: string;
  legacyDiscordUserId?: string;
  legacyDiscordUsername?: string;
  wishlistCategory?: WishlistCategory;
  wishlistCategoryNote?: string;
  effort?: FeedbackEffort;
  priority?: string;
  adminTags?: string[];
  lastStaffCommentAt?: number;
  lastAuthorCommentAt?: number;
  terminalAt?: number;
  archivedAt?: number;
  expiresAt?: number;
  retentionHold?: boolean;
  s3ArchiveKey?: string;
  implementedGameMeta?: { gameId?: string; name?: string };
  resolutionNote?: string;
  gsi2pk?: string;
  gsi2sk?: string;
};

export type FeedbackHistorySummary = {
  id: string;
  kind: FeedbackKind;
  title: string;
  terminalStatus: string;
  closedAt: number;
  authorName: string;
  effectiveVotes: number;
  gameUrl?: string;
  implementedGameMeta?: { gameId?: string; name?: string };
  resolutionNote?: string;
  s3ArchiveKey?: string;
  attachmentKeys?: string[];
  attachmentsPurgeAfter?: number;
  attachmentsPurgedAt?: number;
};

export type FeedbackHistoryItem = FeedbackHistorySummary & {
  pk: string;
  sk: string;
  entityType: 'history';
};

export type FeedbackListIndexItem = {
  pk: string;
  sk: `LIST#${'VOTES' | 'RECENT' | 'UPDATED'}`;
  entityType: 'list';
  id: string;
  kind: FeedbackKind;
  title: string;
  status: FeedbackStatus;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  voteCount: number;
  legacyVoteCount: number;
  effectiveVotes: number;
  commentCount: number;
  attachmentKeys?: string[];
  terminalAt?: number;
  gsi1pk: string;
  gsi1sk: string;
};

export type FeedbackCommentItem = {
  pk: string;
  sk: string;
  entityType: 'comment';
  commentId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  isStaff?: boolean;
};

export type FeedbackVoteItem = {
  pk: string;
  sk: string;
  entityType: 'vote';
  userId: string;
  createdAt: number;
};

export type FeedbackSubscribeItem = {
  pk: string;
  sk: string;
  entityType: 'subscribe';
  userId: string;
  createdAt: number;
  source: 'manual' | 'comment';
};

export type FeedbackUserIndexItem = {
  pk: string;
  sk: string;
  entityType: 'userIndex';
  id: string;
  kind: FeedbackKind;
  createdAt: number;
};

export type FeedbackCreatePars = {
  kind?: string;
  title?: string;
  body?: string;
  gameUrl?: string;
  attachmentKeys?: string[];
  context?: FeedbackBugContext;
  legacyVoteCount?: number;
};

export type FeedbackListPars = {
  kind?: string;
  sort?: string;
  cursor?: string;
  limit?: string | number;
};

export type FeedbackGetPars = {
  id?: string;
};

export type FeedbackVotePars = {
  id?: string;
  vote?: boolean;
};

export type FeedbackCommentPars = {
  id?: string;
  body?: string;
  subscribe?: boolean;
};

export type FeedbackPresignUploadPars = {
  filename?: string;
  contentType?: string;
  contentLength?: number;
};

export type FeedbackSubscribePars = {
  id?: string;
  subscribe?: boolean;
};

export type FeedbackSetStatusPars = {
  id?: string;
  status?: string;
};

export type FeedbackUpdatePars = {
  id?: string;
  title?: string;
  body?: string;
};

export type FeedbackSetAdminFieldsPars = {
  id?: string;
  effort?: string;
  priority?: string;
  adminTags?: string[];
  wishlistCategory?: string;
  wishlistCategoryNote?: string;
};

export type FeedbackMinePars = {
  kind?: string;
  cursor?: string;
  limit?: string | number;
};

export type FeedbackAdminListPars = {
  kind?: string;
  status?: string;
  effort?: string;
  priority?: string;
  needsResponse?: boolean | string;
  cursor?: string;
  limit?: string | number;
};

export type FeedbackPublicPost = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body?: string;
  status: FeedbackStatus;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  voteCount: number;
  legacyVoteCount: number;
  effectiveVotes: number;
  commentCount: number;
  attachmentKeys?: string[];
  gameUrl?: string;
  bggGameId?: string;
  normalizedGameUrl?: string;
  legacyBggItemId?: string;
  legacyBggSubmitter?: string;
  wishlistCategory?: WishlistCategory;
  wishlistCategoryNote?: string;
  effort?: FeedbackEffort;
  priority?: string;
  adminTags?: string[];
  archivedAt?: number;
  expiresAt?: number;
  retentionHold?: boolean;
};

export type FeedbackAdminListItem = FeedbackPublicPost & {
  needsResponse: boolean;
};

export type FeedbackPublicComment = {
  commentId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  isStaff?: boolean;
};

export type FeedbackGetResult = {
  post?: FeedbackPublicPost;
  comments: FeedbackPublicComment[];
  attachmentUrls: { key: string; url: string }[];
  subscribed?: boolean;
  userVoted?: boolean;
  archived?: boolean;
  purged?: boolean;
  summary?: FeedbackHistorySummary;
};

export type FeedbackHistoryListPars = {
  kind?: string;
  cursor?: string;
  limit?: string | number;
};

export type FeedbackHoldRetentionPars = {
  id?: string;
  hold?: boolean;
};

export type FeedbackMergePars = {
  survivorId?: string;
  duplicateId?: string;
};

export type FeedbackDeletePars = {
  id?: string;
  reason?: string;
};

export type FeedbackWishlistSearchPars = {
  q?: string;
  limit?: string | number;
};

export type FeedbackResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; statusCode?: number; code?: string; existingId?: string };
