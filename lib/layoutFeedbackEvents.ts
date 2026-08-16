import {
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const LAYOUT_FEEDBACK_EVENT_TYPES = [
  'session_start',
  'feedback',
  'feedback_note',
  'switch_to_classic',
  'layout_switch',
] as const;
export type LayoutFeedbackEventType = typeof LAYOUT_FEEDBACK_EVENT_TYPES[number];

export const LAYOUT_FEEDBACK_LAYOUT_IDS = ['strip', 'card', 'narrative'] as const;
export type LayoutFeedbackLayoutId = typeof LAYOUT_FEEDBACK_LAYOUT_IDS[number];

export const LAYOUT_FEEDBACK_RATINGS = ['up', 'down'] as const;
export type LayoutFeedbackRating = typeof LAYOUT_FEEDBACK_RATINGS[number];

/** Raw auth API payload for log_layout_feedback_event. */
export type LayoutFeedbackEventPars = {
  event?: string;
  layoutId?: string;
  toLayoutId?: string;
  rating?: string;
  comment?: string;
  gameId?: string;
  durationMs?: number;
};

export type LayoutFeedbackEventRecord = {
  pk: string;
  sk: string;
  event: LayoutFeedbackEventType;
  layoutId: LayoutFeedbackLayoutId;
  gameId?: string;
  durationMs?: number;
  rating?: LayoutFeedbackRating;
  comment?: string;
  toLayoutId?: LayoutFeedbackLayoutId;
};

export type LayoutFeedbackEventValidationResult =
  | { ok: false; message: string }
  | { ok: true; data: LayoutFeedbackEventRecord };

export type LayoutFeedbackEventResult =
  | { ok: true }
  | { ok: false; message: string };

export const LAYOUT_FEEDBACK_PK_PREFIX = 'LAYOUTFB#';
export const LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH = 500;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isLayoutFeedbackEventType(value: string): value is LayoutFeedbackEventType {
  return (LAYOUT_FEEDBACK_EVENT_TYPES as readonly string[]).includes(value);
}

function isLayoutFeedbackLayoutId(value: string): value is LayoutFeedbackLayoutId {
  return (LAYOUT_FEEDBACK_LAYOUT_IDS as readonly string[]).includes(value);
}

function isLayoutFeedbackRating(value: string): value is LayoutFeedbackRating {
  return (LAYOUT_FEEDBACK_RATINGS as readonly string[]).includes(value);
}

function uniqueSortKey(now = Date.now()): string {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}

export function layoutFeedbackEventsPk(userId: string): string {
  return `${LAYOUT_FEEDBACK_PK_PREFIX}${userId}`;
}

export function validateLayoutFeedbackEventPars(
  pars: LayoutFeedbackEventPars,
): LayoutFeedbackEventValidationResult {
  if (!isNonEmptyString(pars.event) || !isLayoutFeedbackEventType(pars.event)) {
    return {
      ok: false,
      message: 'event must be session_start, feedback, feedback_note, switch_to_classic, or layout_switch.',
    };
  }
  if (!isNonEmptyString(pars.layoutId) || !isLayoutFeedbackLayoutId(pars.layoutId)) {
    return { ok: false, message: 'layoutId must be strip, card, or narrative.' };
  }

  const now = Date.now();
  const record: LayoutFeedbackEventRecord = {
    pk: '',
    sk: uniqueSortKey(now),
    event: pars.event,
    layoutId: pars.layoutId,
  };

  if (isNonEmptyString(pars.gameId)) {
    record.gameId = pars.gameId.trim();
  }
  if (typeof pars.durationMs === 'number' && Number.isFinite(pars.durationMs) && pars.durationMs >= 0) {
    record.durationMs = Math.floor(pars.durationMs);
  }

  if (pars.event === 'feedback') {
    if (!isNonEmptyString(pars.rating) || !isLayoutFeedbackRating(pars.rating)) {
      return { ok: false, message: 'rating must be up or down for feedback.' };
    }
    record.rating = pars.rating;
  }

  if (pars.event === 'feedback_note') {
    if (!isNonEmptyString(pars.comment)) {
      return { ok: false, message: 'comment is required for feedback_note.' };
    }
    const trimmed = pars.comment.trim();
    if (trimmed.length > LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH) {
      return {
        ok: false,
        message: `comment must be at most ${LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH} characters.`,
      };
    }
    record.comment = trimmed;
  }

  if (pars.event === 'layout_switch') {
    if (!isNonEmptyString(pars.toLayoutId) || !isLayoutFeedbackLayoutId(pars.toLayoutId)) {
      return { ok: false, message: 'toLayoutId must be strip, card, or narrative for layout_switch.' };
    }
    record.toLayoutId = pars.toLayoutId;
  }

  return { ok: true, data: record };
}

export async function logLayoutFeedbackEvent(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  pars: LayoutFeedbackEventPars,
): Promise<LayoutFeedbackEventResult> {
  const validated = validateLayoutFeedbackEventPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }

  const item = {
    ...validated.data,
    pk: layoutFeedbackEventsPk(userId),
  };

  await client.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));

  return { ok: true };
}
