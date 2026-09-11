import {
  DEFAULT_STATUS_BY_KIND,
  FEEDBACK_ALLOWED_ATTACHMENT_TYPES,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_ATTACHMENT_MAX_COUNT,
  FEEDBACK_BODY_MAX_LENGTH,
  FEEDBACK_COMMENT_MAX_LENGTH,
  FEEDBACK_CONTEXT_MAX_BYTES,
  FEEDBACK_KINDS,
  FEEDBACK_LIST_DEFAULT_LIMIT,
  FEEDBACK_LIST_MAX_LIMIT,
  FEEDBACK_LIST_SORTS,
  FEEDBACK_TITLE_MAX_LENGTH,
} from './constants.js';
import { normalizeGameUrl, parseBggGameId } from './ids.js';
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
  FeedbackSetStatusPars,
  FeedbackSubscribePars,
  FeedbackVotePars,
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
    if (!Array.isArray(pars.attachmentKeys) || pars.attachmentKeys.length < 1) {
      return { ok: false, message: 'bug reports require at least one screenshot attachment key.' };
    }
    if (pars.attachmentKeys.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
      return { ok: false, message: `bug reports allow at most ${FEEDBACK_ATTACHMENT_MAX_COUNT} screenshots.` };
    }
    const keyCheck = assertStagingKeysOwned(userId, pars.attachmentKeys);
    if (!keyCheck.ok) {
      return keyCheck;
    }
    attachmentKeys = pars.attachmentKeys.map((key) => key.trim());
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
    body = isNonEmptyString(pars.body) ? pars.body.trim() : undefined;
    if (body && body.length > FEEDBACK_BODY_MAX_LENGTH) {
      return { ok: false, message: `body must be at most ${FEEDBACK_BODY_MAX_LENGTH} characters.` };
    }
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
