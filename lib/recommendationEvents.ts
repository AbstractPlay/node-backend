import {
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const RECOMMENDATION_EVENT_TYPES = ['rec_show', 'rec_click', 'rec_challenge'] as const;
export type RecommendationEventType = typeof RECOMMENDATION_EVENT_TYPES[number];

export const RECOMMENDATION_SURFACES = ['gamePicker', 'explore', 'dashboard'] as const;
export type RecommendationSurface = typeof RECOMMENDATION_SURFACES[number];

export const RECOMMENDATION_REASON_TYPES = ['content', 'cooccur', 'popularity', 'new'] as const;
export type RecommendationReasonType = typeof RECOMMENDATION_REASON_TYPES[number];

export const RECOMMENDATION_TIERS = ['cold', 'warm'] as const;
export type RecommendationTier = typeof RECOMMENDATION_TIERS[number];

/** Raw auth API payload for log_recommendation_event. */
export type RecommendationEventPars = {
  event?: string;
  batchId?: string;
  surface?: string;
  tier?: string;
  metaGame?: string;
  position?: number;
  reasonType?: string;
  gameIds?: string[];
  reasons?: string[];
};

export type RecommendationEventRecord = {
  pk: string;
  sk: string;
  event: RecommendationEventType;
  batchId: string;
  surface: RecommendationSurface;
  tier: RecommendationTier;
  expiresAt: number;
  metaGame?: string;
  position?: number;
  reasonType?: RecommendationReasonType;
  gameIds?: string[];
  reasons?: string[];
};

export type RecommendationEventValidationResult =
  | { ok: false; message: string }
  | { ok: true; data: RecommendationEventRecord };

export type RecommendationEventResult =
  | { ok: true }
  | { ok: false; message: string };

export const RECOMMENDATION_EVENTS_PK_PREFIX = 'RECOMMENDS#';
export const RECOMMENDATION_EVENT_TTL_DAYS = 90;
export const RECOMMENDATION_EVENTS_PER_DAY_LIMIT = 50;

const SEC_PER_DAY = 86_400;

export function recommendationEventsPk(userId: string): string {
  return `${RECOMMENDATION_EVENTS_PK_PREFIX}${userId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecommendationEventType(value: string): value is RecommendationEventType {
  return (RECOMMENDATION_EVENT_TYPES as readonly string[]).includes(value);
}

function isRecommendationSurface(value: string): value is RecommendationSurface {
  return (RECOMMENDATION_SURFACES as readonly string[]).includes(value);
}

function isRecommendationReasonType(value: string): value is RecommendationReasonType {
  return (RECOMMENDATION_REASON_TYPES as readonly string[]).includes(value);
}

function isRecommendationTier(value: string): value is RecommendationTier {
  return (RECOMMENDATION_TIERS as readonly string[]).includes(value);
}

function startOfUtcDayMs(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function recommendationExpiresAt(now = Date.now()): number {
  return Math.floor(now / 1000) + RECOMMENDATION_EVENT_TTL_DAYS * SEC_PER_DAY;
}

function uniqueSortKey(now = Date.now()): string {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}

export function validateRecommendationEventPars(
  pars: RecommendationEventPars,
): RecommendationEventValidationResult {
  if (!isNonEmptyString(pars.event) || !isRecommendationEventType(pars.event)) {
    return { ok: false, message: 'event must be rec_show, rec_click, or rec_challenge.' };
  }
  if (!isNonEmptyString(pars.batchId)) {
    return { ok: false, message: 'batchId is required.' };
  }
  if (!isNonEmptyString(pars.surface) || !isRecommendationSurface(pars.surface)) {
    return { ok: false, message: 'surface must be gamePicker, explore, or dashboard.' };
  }
  if (!isNonEmptyString(pars.tier) || !isRecommendationTier(pars.tier)) {
    return { ok: false, message: 'tier must be cold or warm.' };
  }

  const now = Date.now();
  const record: RecommendationEventRecord = {
    pk: '',
    sk: uniqueSortKey(now),
    event: pars.event,
    batchId: pars.batchId.trim(),
    surface: pars.surface,
    tier: pars.tier,
    expiresAt: recommendationExpiresAt(now),
  };

  if (pars.event === 'rec_show') {
    if (!Array.isArray(pars.gameIds) || pars.gameIds.length === 0) {
      return { ok: false, message: 'gameIds must be a non-empty array for rec_show.' };
    }
    if (!pars.gameIds.every(id => isNonEmptyString(id))) {
      return { ok: false, message: 'gameIds must contain non-empty strings.' };
    }
    if (!Array.isArray(pars.reasons) || pars.reasons.length !== pars.gameIds.length) {
      return { ok: false, message: 'reasons must be an array matching gameIds length for rec_show.' };
    }
    if (!pars.reasons.every(reason => isNonEmptyString(reason))) {
      return { ok: false, message: 'reasons must contain non-empty strings.' };
    }
    record.gameIds = pars.gameIds.map(id => id.trim());
    record.reasons = pars.reasons.map(reason => reason.trim());
  }

  if (pars.event === 'rec_click') {
    if (!isNonEmptyString(pars.metaGame)) {
      return { ok: false, message: 'metaGame is required for rec_click.' };
    }
    if (typeof pars.position !== 'number' || !Number.isInteger(pars.position) || pars.position < 0) {
      return { ok: false, message: 'position must be a non-negative integer for rec_click.' };
    }
    if (!isNonEmptyString(pars.reasonType) || !isRecommendationReasonType(pars.reasonType)) {
      return { ok: false, message: 'reasonType must be content, cooccur, popularity, or new for rec_click.' };
    }
    record.metaGame = pars.metaGame.trim();
    record.position = pars.position;
    record.reasonType = pars.reasonType;
  }

  if (pars.event === 'rec_challenge') {
    if (!isNonEmptyString(pars.metaGame)) {
      return { ok: false, message: 'metaGame is required for rec_challenge.' };
    }
    record.metaGame = pars.metaGame.trim();
  }

  return { ok: true, data: record };
}

async function countRecommendationEventsToday(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<number> {
  const pk = recommendationEventsPk(userId);
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

export async function logRecommendationEvent(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  pars: RecommendationEventPars,
): Promise<RecommendationEventResult> {
  const validated = validateRecommendationEventPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message };
  }

  const eventCount = await countRecommendationEventsToday(client, tableName, userId);
  if (eventCount >= RECOMMENDATION_EVENTS_PER_DAY_LIMIT) {
    return { ok: false, message: 'Recommendation event rate limit exceeded.' };
  }

  const item = {
    ...validated.data,
    pk: recommendationEventsPk(userId),
  };

  await client.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));

  return { ok: true };
}
