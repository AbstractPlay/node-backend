import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { parseUserNamesAllFlag } from '../playerActivityWindow.js';
import {
  consumeFixedWindowLimit,
  type RateLimitWindow,
  windowExpiresAtSec,
  windowSortKey,
} from './fixedWindow.js';
import { hashRateKey } from './hashKey.js';

const RATE_LIMIT_PK_PREFIX = 'RATELIMIT#public#';

export const PUBLIC_READ_RATE_LIMITED_QUERIES = [
  'user_names',
  'get_public_exploration',
  'recent_completed_games',
  'standing_challenges',
  'all_standing_challenges',
  'get_ladder_activity',
] as const;

type FixedWindowLimits = Partial<Record<RateLimitWindow, number>>;

const PROD_LIMITS: Record<string, FixedWindowLimits> = {
  user_names: { minute: 6, hour: 60, day: 300 },
  user_names_all: { minute: 2, hour: 10, day: 30 },
  get_public_exploration: { minute: 20, hour: 120, day: 500 },
  recent_completed_games: { minute: 15, hour: 90, day: 400 },
  standing_challenges: { minute: 20, hour: 120, day: 500 },
  all_standing_challenges: { minute: 15, hour: 90, day: 400 },
  get_ladder_activity: { minute: 15, hour: 90, day: 400 },
};

const WINDOW_ORDER: RateLimitWindow[] = ['minute', 'hour', 'day'];

const DEV_LIMIT_MULTIPLIER = 10;

export type PublicReadRateLimitDeps = {
  tableName: string;
  docClient: DynamoDBDocumentClient;
  now?: () => number;
  stage?: string;
  limitsDisabled?: boolean;
};

export function resolvePublicReadLimitScope(
  queryName: string,
  pars: { all?: unknown },
): string | null {
  if (queryName === 'user_names') {
    return parseUserNamesAllFlag(pars.all) ? 'user_names_all' : 'user_names';
  }
  if ((PUBLIC_READ_RATE_LIMITED_QUERIES as readonly string[]).includes(queryName)) {
    return queryName;
  }
  return null;
}

function scaleLimits(limits: FixedWindowLimits, multiplier: number): FixedWindowLimits {
  if (multiplier === 1) {
    return limits;
  }
  const out: FixedWindowLimits = {};
  for (const w of WINDOW_ORDER) {
    const n = limits[w];
    if (n !== undefined) {
      out[w] = n * multiplier;
    }
  }
  return out;
}

function defaultDeps(): PublicReadRateLimitDeps {
  const stage = process.env.WEBSOCKET_STAGE ?? 'dev';
  return {
    tableName: process.env.ABSTRACT_PLAY_TABLE ?? '',
    docClient: ddbDocClient,
    stage,
    limitsDisabled: process.env.PUBLIC_READ_RATE_LIMITS === '0',
  };
}

export type EnforcePublicReadRateLimitResult =
  | { allowed: true }
  | { allowed: false; scope: string; window: RateLimitWindow };

export async function enforcePublicReadRateLimit(
  queryName: string | undefined,
  pars: Record<string, unknown> | undefined,
  depsIn?: Partial<PublicReadRateLimitDeps>,
): Promise<EnforcePublicReadRateLimitResult> {
  const deps = { ...defaultDeps(), ...depsIn };
  if (!queryName || deps.limitsDisabled || !deps.tableName) {
    return { allowed: true };
  }

  const scope = resolvePublicReadLimitScope(queryName, pars ?? {});
  if (!scope) {
    return { allowed: true };
  }

  const clientIp = typeof pars?._clientIp === 'string' ? pars._clientIp.trim() : '';
  if (!clientIp) {
    return { allowed: true };
  }

  const base = PROD_LIMITS[scope];
  if (!base) {
    return { allowed: true };
  }

  const multiplier = deps.stage === 'dev' ? DEV_LIMIT_MULTIPLIER : 1;
  const limits = scaleLimits(base, multiplier);
  const now = deps.now?.() ?? Date.now();
  const subjectHash = hashRateKey(clientIp);
  const pk = `${RATE_LIMIT_PK_PREFIX}${scope}#${subjectHash}`;

  for (const window of WINDOW_ORDER) {
    const limit = limits[window];
    if (limit === undefined) {
      continue;
    }
    const sk = windowSortKey(now, window);
    const result = await consumeFixedWindowLimit({
      tableName: deps.tableName,
      client: deps.docClient,
      pk,
      sk,
      limit,
      expiresAtSec: windowExpiresAtSec(now, window),
    });
    if (!result.allowed) {
      return { allowed: false, scope, window };
    }
  }

  return { allowed: true };
}