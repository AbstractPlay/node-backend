import { createHash } from 'crypto';
import {
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const LAYOUT_EVENT_TYPES = ['session_start', 'layout_switch'] as const;
export type LayoutEventType = typeof LAYOUT_EVENT_TYPES[number];

export const LAYOUT_EVENT_LAYOUT_IDS = ['classic', 'strip', 'card', 'narrative'] as const;
export type LayoutEventLayoutId = typeof LAYOUT_EVENT_LAYOUT_IDS[number];

export const LAYOUT_RESOLVED_FROM = ['url', 'localStorage', 'default'] as const;
export type LayoutResolvedFrom = typeof LAYOUT_RESOLVED_FROM[number];

/** Raw API payload for log_gamemove_layout_event. */
export type LayoutEventPars = {
  event?: string;
  sessionId?: string;
  layout?: string;
  resolvedFrom?: string;
  storedLayout?: string;
  viewportWidth?: number;
  metaGame?: string;
  from?: string;
  to?: string;
};

export type LayoutEventRecord = {
  pk: string;
  sk: string;
  event: LayoutEventType;
  sessionId: string;
  layout: LayoutEventLayoutId;
  resolvedFrom: LayoutResolvedFrom;
  metaGame: string;
  ts: number;
  isLoggedIn: boolean;
  storedLayout?: LayoutEventLayoutId;
  viewportWidth?: number;
  userHash?: string;
  from?: LayoutEventLayoutId;
  to?: LayoutEventLayoutId;
};

export type LayoutEventValidationResult =
  | { ok: false; message: string }
  | { ok: true; data: Omit<LayoutEventRecord, 'pk' | 'sk' | 'ts' | 'isLoggedIn' | 'userHash'> & {
    from?: LayoutEventLayoutId;
    to?: LayoutEventLayoutId;
  } };

export type LayoutEventResult =
  | { ok: true }
  | { ok: false; message: string };

export const LAYOUT_EVENTS_PK_PREFIX = 'LAYOUTEVT#';
export const LAYOUT_EVENTS_ANON_PK_PREFIX = 'LAYOUTEVT#anon#';
export const LAYOUT_EVENTS_PER_DAY_LIMIT = 100;
export const LAYOUT_EVENTS_ANON_PER_DAY_LIMIT = 25;

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isLayoutEventType(value: string): value is LayoutEventType {
  return (LAYOUT_EVENT_TYPES as readonly string[]).includes(value);
}

function isLayoutEventLayoutId(value: string): value is LayoutEventLayoutId {
  if (value === 'queue') {
    return true;
  }
  return (LAYOUT_EVENT_LAYOUT_IDS as readonly string[]).includes(value);
}

function normalizeLayoutId(value: string): LayoutEventLayoutId {
  if (value === 'queue') {
    return 'card';
  }
  return value as LayoutEventLayoutId;
}

function isLayoutResolvedFrom(value: string): value is LayoutResolvedFrom {
  return (LAYOUT_RESOLVED_FROM as readonly string[]).includes(value);
}

function startOfUtcDayMs(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function uniqueSortKey(now = Date.now()): string {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}

export function layoutEventsPk(userId: string): string {
  return `${LAYOUT_EVENTS_PK_PREFIX}${userId}`;
}

export function layoutEventsAnonPk(sessionId: string): string {
  return `${LAYOUT_EVENTS_ANON_PK_PREFIX}${sessionId}`;
}

export function layoutEventUserHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

export function validateLayoutEventPars(
  pars: LayoutEventPars,
): LayoutEventValidationResult {
  if (!isNonEmptyString(pars.event) || !isLayoutEventType(pars.event)) {
    return { ok: false, message: 'event must be session_start or layout_switch.' };
  }
  if (!isNonEmptyString(pars.sessionId) || !SESSION_ID_RE.test(pars.sessionId.trim())) {
    return { ok: false, message: 'sessionId must be a UUID.' };
  }
  if (!isNonEmptyString(pars.layout) || !isLayoutEventLayoutId(pars.layout)) {
    return { ok: false, message: 'layout must be classic, strip, card, or narrative.' };
  }
  if (!isNonEmptyString(pars.resolvedFrom) || !isLayoutResolvedFrom(pars.resolvedFrom)) {
    return { ok: false, message: 'resolvedFrom must be url, localStorage, or default.' };
  }
  if (!isNonEmptyString(pars.metaGame)) {
    return { ok: false, message: 'metaGame is required.' };
  }

  const record = {
    event: pars.event,
    sessionId: pars.sessionId.trim(),
    layout: normalizeLayoutId(pars.layout),
    resolvedFrom: pars.resolvedFrom,
    metaGame: pars.metaGame.trim(),
  };

  if (isNonEmptyString(pars.storedLayout)) {
    if (!isLayoutEventLayoutId(pars.storedLayout)) {
      return { ok: false, message: 'storedLayout must be classic, strip, card, or narrative.' };
    }
    Object.assign(record, { storedLayout: normalizeLayoutId(pars.storedLayout) });
  }

  if (typeof pars.viewportWidth === 'number' && Number.isFinite(pars.viewportWidth) && pars.viewportWidth > 0) {
    Object.assign(record, { viewportWidth: Math.floor(pars.viewportWidth) });
  }

  if (pars.event === 'layout_switch') {
    if (!isNonEmptyString(pars.from) || !isLayoutEventLayoutId(pars.from)) {
      return { ok: false, message: 'from must be classic, strip, card, or narrative for layout_switch.' };
    }
    if (!isNonEmptyString(pars.to) || !isLayoutEventLayoutId(pars.to)) {
      return { ok: false, message: 'to must be classic, strip, card, or narrative for layout_switch.' };
    }
    Object.assign(record, {
      from: normalizeLayoutId(pars.from),
      to: normalizeLayoutId(pars.to),
    });
  }

  return { ok: true, data: record };
}

async function countLayoutEventsTodayForPk(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<number> {
  const dayStartSk = String(startOfUtcDayMs());
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND sk >= :dayStart',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':dayStart': dayStartSk,
      },
      ExclusiveStartKey: lastKey,
      Select: 'COUNT',
    }));
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

export async function logLayoutEvent(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string | undefined,
  pars: LayoutEventPars,
): Promise<LayoutEventResult> {
  const validated = validateLayoutEventPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }

  const now = Date.now();
  const isLoggedIn = isNonEmptyString(userId);
  const pk = isLoggedIn
    ? layoutEventsPk(userId!)
    : layoutEventsAnonPk(validated.data.sessionId);
  const limit = isLoggedIn
    ? LAYOUT_EVENTS_PER_DAY_LIMIT
    : LAYOUT_EVENTS_ANON_PER_DAY_LIMIT;

  const eventCount = await countLayoutEventsTodayForPk(client, tableName, pk);
  if (eventCount >= limit) {
    return { ok: false, message: 'Layout event rate limit exceeded.' };
  }

  const item: LayoutEventRecord = {
    ...validated.data,
    pk,
    sk: uniqueSortKey(now),
    ts: now,
    isLoggedIn,
  };

  if (isLoggedIn) {
    item.userHash = layoutEventUserHash(userId!);
  }

  await client.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));

  return { ok: true };
}
