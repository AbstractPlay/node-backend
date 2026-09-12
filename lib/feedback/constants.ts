export const FEEDBACK_KINDS = ['bug', 'feature', 'wishlist'] as const;

export const BUG_STATUSES = [
  'open',
  'triaged',
  'monitoring',
  'resolved',
  'closed',
] as const;
export const FEATURE_STATUSES = ['open', 'under_review', 'planned', 'in_progress', 'shipped', 'declined'] as const;
export const WISHLIST_STATUSES = ['requested', 'evaluating', 'in_development', 'available'] as const;

export const TERMINAL_STATUSES: Record<typeof FEEDBACK_KINDS[number], readonly string[]> = {
  bug: ['resolved', 'closed'],
  feature: ['shipped', 'declined'],
  wishlist: ['available'],
};

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'unknown'] as const;
export const PRIORITY_LEVELS = ['urgent', 'normal', 'low'] as const;

export const WISHLIST_CATEGORIES = [
  'none',
  'permissions_required',
  'declined',
  'feasible',
  'low_priority',
  'not_feasible',
] as const;

export const WISHLIST_CATEGORY_FILTER_CHIPS = [
  'permissions_required',
  'declined',
] as const;

export const FEEDBACK_LIST_SORTS = ['votes', 'recent', 'updated'] as const;

export const FEEDBACK_COMMENT_MAX_LENGTH = 2000;
export const FEEDBACK_DELETE_REASON_MAX_LENGTH = 2000;
export const FEEDBACK_TITLE_MAX_LENGTH = 200;
export const FEEDBACK_BODY_MAX_LENGTH = 10_000;
export const FEEDBACK_PRIORITY_MAX_LENGTH = 50;
export const FEEDBACK_ADMIN_TAG_MAX_COUNT = 20;
export const FEEDBACK_ADMIN_TAG_MAX_LENGTH = 40;
export const FEEDBACK_REVIEWER_MAX_COUNT = 8;
export const FEEDBACK_LIST_DEFAULT_LIMIT = 50;
export const FEEDBACK_LIST_MAX_LIMIT = 100;
export const FEEDBACK_CONTEXT_MAX_BYTES = 16_384;
export const FEEDBACK_ATTACHMENT_PRESIGN_TTL_SECONDS = 900;
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 5_242_880;
export const FEEDBACK_ATTACHMENT_MAX_COUNT = 3;
export const FEEDBACK_COMMENT_ATTACHMENT_MAX_COUNT = 3;
export const FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT = 1;
export const FEEDBACK_ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const DEFAULT_STATUS_BY_KIND: Record<typeof FEEDBACK_KINDS[number], string> = {
  bug: 'open',
  feature: 'open',
  wishlist: 'requested',
};

export const FEEDBACK_ARCHIVE_AFTER_TERMINAL_DAYS = 7;
export const FEEDBACK_LIVE_RETENTION_AFTER_ARCHIVE_DAYS = 90;
export const FEEDBACK_ARCHIVE_S3_PREFIX = 'archive';
export const FEEDBACK_STAGING_MAX_AGE_HOURS = 24;
