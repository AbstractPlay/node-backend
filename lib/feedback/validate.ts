import {
  DEFAULT_STATUS_BY_KIND,
  EFFORT_LEVELS,
  FEEDBACK_ADMIN_TAG_MAX_COUNT,
  FEEDBACK_ADMIN_TAG_MAX_LENGTH,
  FEEDBACK_ALLOWED_ATTACHMENT_TYPES,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_ATTACHMENT_MAX_COUNT,
  FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT,
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_COMMENT_MAX_LENGTH,
  FEEDBACK_DELETE_REASON_MAX_LENGTH,
  FEEDBACK_CONTEXT_MAX_BYTES,
  FEEDBACK_KINDS,
  FEEDBACK_LIST_DEFAULT_LIMIT,
  FEEDBACK_LIST_MAX_LIMIT,
  FEEDBACK_LIST_SORTS,
  PRIORITY_LEVELS,
  FEEDBACK_TITLE_MAX_LENGTH,
  WISHLIST_CATEGORIES,
} from './constants.js';
import { normalizeGameUrl, normalizedGameUrlForDedup, parseBggGameId } from './ids.js';
import { assertStagingKeysOwned } from './attachments.js';
import { isValidStatusForKind } from './status.js';
import type {
  FeedbackCommentPars,
  FeedbackCreatePars,
  FeedbackGetPars,
  FeedbackKind,
  FeedbackListPars,
  FeedbackListSort,
  FeedbackPresignUploadPars,
  FeedbackAdminListPars,
  FeedbackMinePars,
  FeedbackSetAdminFieldsPars,
  FeedbackSetStatusPars,
  FeedbackSubscribePars,
  FeedbackUpdatePars,
  FeedbackVotePars,
  FeedbackDeletePars,
  FeedbackMergePars,
  FeedbackWishlistSearchPars,
} from './types.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isFeedbackKind(value: string): value is FeedbackKind {
  return (FEEDBACK_KINDS as readonly string[]).includes(value);
}

function isListSort(value: string): value is FeedbackListSort {
  return (FEEDBACK_LIST_SORTS as readonly string[]).includes(value);
}

function isPriorityLevel(value: string): boolean {
  return (PRIORITY_LEVELS as readonly string[]).includes(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function truncateContext(context: FeedbackCreatePars['context']): FeedbackCreatePars['context'] | undefined {
  if (!context) {
    return undefined;
  }
  const json = JSON.stringify(context);
  if (json.length <= FEEDBACK_CONTEXT_MAX_BYTES) {
    return context;
  }
  const trimmed = { ...context, consoleErrors: context.consoleErrors?.slice(-5) };
  if (JSON.stringify(trimmed).length <= FEEDBACK_CONTEXT_MAX_BYTES) {
    return trimmed;
  }
  return { pageUrl: context.pageUrl, capturedError: context.capturedError };
}

export type ValidatedFeedbackCreate = {
  kind: FeedbackKind;
  title: string;
  body?: string;
  status: string;
  gameUrl?: string;
  bggGameId?: string;
  normalizedGameUrl?: string;
  wishlistCategory?: string;
  legacyBggItemId?: string;
  legacyBggSubmitter?: string;
  attachmentKeys?: string[];
  context?: FeedbackCreatePars['context'];
  legacyVoteCount: number;
};

export function validateFeedbackCreatePars(
  userId: string,
  pars: FeedbackCreatePars,
): { ok: true; data: ValidatedFeedbackCreate } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.kind) || !isFeedbackKind(pars.kind)) {
    return { ok: false, message: 'kind must be bug, feature, or wishlist.' };
  }
  if (!isNonEmptyString(pars.title) || pars.title.trim().length > FEEDBACK_TITLE_MAX_LENGTH) {
    return { ok: false, message: `title is required (max ${FEEDBACK_TITLE_MAX_LENGTH} characters).` };
  }

  const kind = pars.kind;
  const title = pars.title.trim();
  let body: string | undefined;
  let gameUrl: string | undefined;
  let bggGameId: string | undefined;
  let attachmentKeys: string[] | undefined;
  let context: FeedbackCreatePars['context'] | undefined;

  if (kind === 'bug') {
    if (Array.isArray(pars.attachmentKeys) && pars.attachmentKeys.length > 0) {
      if (pars.attachmentKeys.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
        return { ok: false, message: `bug reports allow at most ${FEEDBACK_ATTACHMENT_MAX_COUNT} screenshots.` };
      }
      const keyCheck = assertStagingKeysOwned(userId, pars.attachmentKeys);
      if (!keyCheck.ok) {
        return keyCheck;
      }
      attachmentKeys = pars.attachmentKeys.map((key) => key.trim());
    }
    body = isNonEmptyString(pars.body) ? pars.body.trim() : undefined;
    if (body && body.length > FEEDBACK_BODY_MAX_LENGTH) {
      return { ok: false, message: `body must be at most ${FEEDBACK_BODY_MAX_LENGTH} characters.` };
    }
    context = truncateContext(pars.context);
  } else if (kind === 'feature') {
    if (!isNonEmptyString(pars.body)) {
      return { ok: false, message: 'feature suggestions require a body.' };
    }
    body = pars.body.trim();
    if (body.length > FEEDBACK_BODY_MAX_LENGTH) {
      return { ok: false, message: `body must be at most ${FEEDBACK_BODY_MAX_LENGTH} characters.` };
    }
    if (Array.isArray(pars.attachmentKeys) && pars.attachmentKeys.length > 0) {
      if (pars.attachmentKeys.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
        return { ok: false, message: `feature suggestions allow at most ${FEEDBACK_ATTACHMENT_MAX_COUNT} attachments.` };
      }
      const keyCheck = assertStagingKeysOwned(userId, pars.attachmentKeys);
      if (!keyCheck.ok) {
        return keyCheck;
      }
      attachmentKeys = pars.attachmentKeys.map((key) => key.trim());
    }
  } else {
    if (!isNonEmptyString(pars.gameUrl) || !isHttpsUrl(pars.gameUrl.trim())) {
      return { ok: false, message: 'wishlist entries require a valid https gameUrl.' };
    }
    gameUrl = normalizeGameUrl(pars.gameUrl);
    bggGameId = parseBggGameId(gameUrl);
    const normalizedGameUrl = normalizedGameUrlForDedup(gameUrl);
    if (Array.isArray(pars.attachmentKeys) && pars.attachmentKeys.length > 0) {
      if (pars.attachmentKeys.length > FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT) {
        return {
          ok: false,
          message: `wishlist entries allow at most ${FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT} image.`,
        };
      }
      const keyCheck = assertStagingKeysOwned(userId, pars.attachmentKeys);
      if (!keyCheck.ok) {
        return keyCheck;
      }
      attachmentKeys = pars.attachmentKeys.map((key) => key.trim());
    }
    body = isNonEmptyString(pars.body) ? pars.body.trim() : undefined;
    if (body && body.length > FEEDBACK_BODY_MAX_LENGTH) {
      return { ok: false, message: `body must be at most ${FEEDBACK_BODY_MAX_LENGTH} characters.` };
    }
    return {
      ok: true,
      data: {
        kind,
        title,
        body,
        status: DEFAULT_STATUS_BY_KIND[kind],
        gameUrl,
        bggGameId,
        normalizedGameUrl,
        wishlistCategory: 'none',
        attachmentKeys,
        context,
        legacyVoteCount: typeof pars.legacyVoteCount === 'number' && pars.legacyVoteCount >= 0
          ? Math.floor(pars.legacyVoteCount)
          : 0,
      },
    };
  }

  const legacyVoteCount = typeof pars.legacyVoteCount === 'number' && pars.legacyVoteCount >= 0
    ? Math.floor(pars.legacyVoteCount)
    : 0;

  return {
    ok: true,
    data: {
      kind,
      title,
      body,
      status: DEFAULT_STATUS_BY_KIND[kind],
      gameUrl,
      bggGameId,
      attachmentKeys,
      context,
      legacyVoteCount,
    },
  };
}

export function validateFeedbackListPars(
  pars: FeedbackListPars,
): { ok: true; data: { kind: FeedbackKind; sort: FeedbackListSort; limit: number; cursor?: string } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.kind) || !isFeedbackKind(pars.kind)) {
    return { ok: false, message: 'kind must be bug, feature, or wishlist.' };
  }
  const sort = isNonEmptyString(pars.sort) && isListSort(pars.sort) ? pars.sort : 'votes';
  const rawLimit = pars.limit === undefined ? FEEDBACK_LIST_DEFAULT_LIMIT : Number(pars.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(FEEDBACK_LIST_MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : FEEDBACK_LIST_DEFAULT_LIMIT;
  const cursor = isNonEmptyString(pars.cursor) ? pars.cursor : undefined;
  return { ok: true, data: { kind: pars.kind, sort, limit, cursor } };
}

export function validateFeedbackGetPars(
  pars: FeedbackGetPars,
): { ok: true; data: { id: string } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  return { ok: true, data: { id: pars.id.trim() } };
}

export function validateFeedbackVotePars(
  pars: FeedbackVotePars,
): { ok: true; data: { id: string; vote: boolean } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  if (typeof pars.vote !== 'boolean') {
    return { ok: false, message: 'vote must be a boolean.' };
  }
  return { ok: true, data: { id: pars.id.trim(), vote: pars.vote } };
}

export function validateFeedbackCommentPars(
  pars: FeedbackCommentPars,
): { ok: true; data: { id: string; body: string; subscribe: boolean } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  if (!isNonEmptyString(pars.body) || pars.body.trim().length > FEEDBACK_COMMENT_MAX_LENGTH) {
    return { ok: false, message: `body is required (max ${FEEDBACK_COMMENT_MAX_LENGTH} characters).` };
  }
  const subscribe = pars.subscribe === undefined ? true : Boolean(pars.subscribe);
  return {
    ok: true,
    data: {
      id: pars.id.trim(),
      body: pars.body.trim(),
      subscribe,
    },
  };
}

export function validateFeedbackPresignUploadPars(
  pars: FeedbackPresignUploadPars,
): { ok: true; data: { contentType: string; contentLength: number } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.contentType)) {
    return { ok: false, message: 'contentType is required.' };
  }
  if (!(FEEDBACK_ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(pars.contentType)) {
    return { ok: false, message: 'contentType must be image/png, image/jpeg, or image/webp.' };
  }
  const contentLength = Number(pars.contentLength);
  if (!Number.isFinite(contentLength) || contentLength < 1) {
    return { ok: false, message: 'contentLength is required.' };
  }
  if (contentLength > FEEDBACK_ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: `attachments must be at most ${FEEDBACK_ATTACHMENT_MAX_BYTES} bytes.` };
  }
  return { ok: true, data: { contentType: pars.contentType, contentLength } };
}

export function validateFeedbackSubscribePars(
  pars: FeedbackSubscribePars,
): { ok: true; data: { id: string; subscribe: boolean } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  if (typeof pars.subscribe !== 'boolean') {
    return { ok: false, message: 'subscribe must be a boolean.' };
  }
  return { ok: true, data: { id: pars.id.trim(), subscribe: pars.subscribe } };
}

export function validateFeedbackSetStatusPars(
  pars: FeedbackSetStatusPars,
  kind: FeedbackKind,
): { ok: true; data: { id: string; status: string } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  if (!isNonEmptyString(pars.status)) {
    return { ok: false, message: 'status is required.' };
  }
  const status = pars.status.trim();
  if (!isValidStatusForKind(kind, status)) {
    return { ok: false, message: `invalid status for kind ${kind}.` };
  }
  return { ok: true, data: { id: pars.id.trim(), status } };
}

export function validateFeedbackUpdatePars(
  pars: FeedbackUpdatePars,
): { ok: true; data: { id: string; title?: string; body?: string } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  const title = isNonEmptyString(pars.title) ? pars.title.trim() : undefined;
  const body = isNonEmptyString(pars.body) ? pars.body.trim() : undefined;
  if (!title && !body) {
    return { ok: false, message: 'title or body is required.' };
  }
  if (title && title.length > FEEDBACK_TITLE_MAX_LENGTH) {
    return { ok: false, message: `title must be at most ${FEEDBACK_TITLE_MAX_LENGTH} characters.` };
  }
  if (body && body.length > FEEDBACK_BODY_MAX_LENGTH) {
    return { ok: false, message: `body must be at most ${FEEDBACK_BODY_MAX_LENGTH} characters.` };
  }
  return { ok: true, data: { id: pars.id.trim(), title, body } };
}

function parseAdminTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= FEEDBACK_ADMIN_TAG_MAX_LENGTH);
  if (tags.length > FEEDBACK_ADMIN_TAG_MAX_COUNT) {
    return undefined;
  }
  return tags;
}

export function validateFeedbackSetAdminFieldsPars(
  pars: FeedbackSetAdminFieldsPars,
  kind: FeedbackKind,
): {
  ok: true;
  data: {
    id: string;
    effort?: string;
    priority?: string | null;
    adminTags?: string[];
    wishlistCategory?: string;
    wishlistCategoryNote?: string;
  };
} | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  const data: {
    id: string;
    effort?: string;
    priority?: string | null;
    adminTags?: string[];
    wishlistCategory?: string;
    wishlistCategoryNote?: string;
  } = { id: pars.id.trim() };

  if (pars.effort !== undefined) {
    if (!isNonEmptyString(pars.effort) || !(EFFORT_LEVELS as readonly string[]).includes(pars.effort)) {
      return { ok: false, message: 'effort must be low, medium, high, or unknown.' };
    }
    data.effort = pars.effort;
  }
  if (pars.priority !== undefined) {
    if (pars.priority === '' || pars.priority === null) {
      data.priority = null;
    } else if (!isNonEmptyString(pars.priority) || !isPriorityLevel(pars.priority)) {
      return { ok: false, message: 'priority must be urgent, normal, or low.' };
    } else {
      data.priority = pars.priority;
    }
  }
  if (pars.adminTags !== undefined) {
    const tags = parseAdminTags(pars.adminTags);
    if (!tags) {
      return { ok: false, message: 'adminTags must be a list of short strings.' };
    }
    data.adminTags = tags;
  }
  if (kind === 'wishlist') {
    if (pars.wishlistCategory !== undefined) {
      if (!isNonEmptyString(pars.wishlistCategory)
        || !(WISHLIST_CATEGORIES as readonly string[]).includes(pars.wishlistCategory)) {
        return { ok: false, message: 'invalid wishlistCategory.' };
      }
      data.wishlistCategory = pars.wishlistCategory;
    }
    if (pars.wishlistCategoryNote !== undefined) {
      if (!isNonEmptyString(pars.wishlistCategoryNote)) {
        return { ok: false, message: 'wishlistCategoryNote must be a non-empty string.' };
      }
      data.wishlistCategoryNote = pars.wishlistCategoryNote.trim();
    }
  } else if (pars.wishlistCategory !== undefined || pars.wishlistCategoryNote !== undefined) {
    return { ok: false, message: 'wishlist fields are only valid for wishlist items.' };
  }

  if (
    data.effort === undefined
    && data.priority === undefined
    && data.adminTags === undefined
    && data.wishlistCategory === undefined
    && data.wishlistCategoryNote === undefined
  ) {
    return { ok: false, message: 'at least one admin field is required.' };
  }
  return { ok: true, data };
}

export function validateFeedbackMinePars(
  pars: FeedbackMinePars,
): { ok: true; data: { kind?: FeedbackKind; limit: number; cursor?: string } } | { ok: false; message: string } {
  let kind: FeedbackKind | undefined;
  if (pars.kind !== undefined && pars.kind !== '') {
    if (!isNonEmptyString(pars.kind) || !isFeedbackKind(pars.kind)) {
      return { ok: false, message: 'kind must be bug, feature, or wishlist.' };
    }
    kind = pars.kind;
  }
  const rawLimit = pars.limit === undefined ? FEEDBACK_LIST_DEFAULT_LIMIT : Number(pars.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(FEEDBACK_LIST_MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : FEEDBACK_LIST_DEFAULT_LIMIT;
  const cursor = isNonEmptyString(pars.cursor) ? pars.cursor : undefined;
  return { ok: true, data: { kind, limit, cursor } };
}

export function validateFeedbackAdminListPars(
  pars: FeedbackAdminListPars,
): {
  ok: true;
  data: {
    kind: FeedbackKind;
    status?: string;
    effort?: string;
    priority?: string;
    needsResponse?: boolean;
    limit: number;
    cursor?: string;
  };
} | { ok: false; message: string } {
  if (!isNonEmptyString(pars.kind) || !isFeedbackKind(pars.kind)) {
    return { ok: false, message: 'kind must be bug, feature, or wishlist.' };
  }
  const kind = pars.kind;
  const status = isNonEmptyString(pars.status) ? pars.status.trim() : undefined;
  if (status && !isValidStatusForKind(kind, status)) {
    return { ok: false, message: `invalid status for kind ${kind}.` };
  }
  const effort = isNonEmptyString(pars.effort) ? pars.effort.trim() : undefined;
  if (effort && !(EFFORT_LEVELS as readonly string[]).includes(effort)) {
    return { ok: false, message: 'effort must be low, medium, high, or unknown.' };
  }
  const priority = isNonEmptyString(pars.priority) ? pars.priority.trim() : undefined;
  if (priority && !isPriorityLevel(priority)) {
    return { ok: false, message: 'priority must be urgent, normal, or low.' };
  }
  const needsResponse = pars.needsResponse === true || pars.needsResponse === 'true' || pars.needsResponse === '1';
  const rawLimit = pars.limit === undefined ? FEEDBACK_LIST_DEFAULT_LIMIT : Number(pars.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(FEEDBACK_LIST_MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : FEEDBACK_LIST_DEFAULT_LIMIT;
  const cursor = isNonEmptyString(pars.cursor) ? pars.cursor : undefined;
  return {
    ok: true,
    data: { kind, status, effort, priority, needsResponse: needsResponse || undefined, limit, cursor },
  };
}

export function validateFeedbackDeletePars(
  pars: FeedbackDeletePars,
): { ok: true; data: { id: string; reason: string } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  if (!isNonEmptyString(pars.reason)) {
    return { ok: false, message: 'reason is required.' };
  }
  const id = pars.id.trim();
  const reason = pars.reason.trim();
  if (reason.length > FEEDBACK_DELETE_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `reason must be at most ${FEEDBACK_DELETE_REASON_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, data: { id, reason } };
}

export function validateFeedbackMergePars(
  pars: FeedbackMergePars,
): { ok: true; data: { survivorId: string; duplicateId: string } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.survivorId)) {
    return { ok: false, message: 'survivorId is required.' };
  }
  if (!isNonEmptyString(pars.duplicateId)) {
    return { ok: false, message: 'duplicateId is required.' };
  }
  const survivorId = pars.survivorId.trim();
  const duplicateId = pars.duplicateId.trim();
  if (survivorId === duplicateId) {
    return { ok: false, message: 'survivorId and duplicateId must differ.' };
  }
  return { ok: true, data: { survivorId, duplicateId } };
}

export function validateFeedbackHistoryListPars(
  pars: { kind?: string; cursor?: string; limit?: string | number },
): { ok: true; data: { kind: typeof FEEDBACK_KINDS[number]; limit: number; cursor?: string } } | { ok: false; message: string } {
  if (!pars.kind || !FEEDBACK_KINDS.includes(pars.kind as typeof FEEDBACK_KINDS[number])) {
    return { ok: false, message: `kind must be one of: ${FEEDBACK_KINDS.join(', ')}.` };
  }
  const rawLimit = pars.limit === undefined ? FEEDBACK_LIST_DEFAULT_LIMIT : Number(pars.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(FEEDBACK_LIST_MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : FEEDBACK_LIST_DEFAULT_LIMIT;
  const cursor = typeof pars.cursor === 'string' && pars.cursor.trim() ? pars.cursor.trim() : undefined;
  return { ok: true, data: { kind: pars.kind as typeof FEEDBACK_KINDS[number], limit, cursor } };
}

export function validateFeedbackHoldRetentionPars(
  pars: { id?: string; hold?: boolean },
): { ok: true; data: { id: string; hold: boolean } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.id)) {
    return { ok: false, message: 'id is required.' };
  }
  if (typeof pars.hold !== 'boolean') {
    return { ok: false, message: 'hold must be a boolean.' };
  }
  return { ok: true, data: { id: pars.id.trim(), hold: pars.hold } };
}

export function validateFeedbackWishlistSearchPars(
  pars: FeedbackWishlistSearchPars,
): { ok: true; data: { q: string; limit: number } } | { ok: false; message: string } {
  if (!isNonEmptyString(pars.q)) {
    return { ok: false, message: 'q is required.' };
  }
  const q = pars.q.trim();
  if (q.length < 2) {
    return { ok: false, message: 'q must be at least 2 characters.' };
  }
  const rawLimit = pars.limit === undefined ? 20 : Number(pars.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(FEEDBACK_LIST_MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : 20;
  return { ok: true, data: { q, limit } };
}
