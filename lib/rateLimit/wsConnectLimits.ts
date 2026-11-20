import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import {
  consumeFixedWindowLimit,
  type RateLimitWindow,
  windowExpiresAtSec,
  windowSortKey,
} from './fixedWindow.js';
import { hashRateKey } from './hashKey.js';

const RATE_LIMIT_PK_PREFIX = 'RATELIMIT#ws#';
const WS_CONNECT_SCOPE = 'ws_connect';

const WINDOW_ORDER: RateLimitWindow[] = ['minute', 'hour', 'day'];

const PROD_LIMITS: Record<RateLimitWindow, number> = {
  minute: 12,
  hour: 80,
  day: 300,
};

const DEV_LIMIT_MULTIPLIER = 10;

export type WsConnectRateLimitDeps = {
  tableName: string;
  docClient: DynamoDBDocumentClient;
  now?: () => number;
  stage?: string;
  limitsDisabled?: boolean;
};

function defaultDeps(): WsConnectRateLimitDeps {
  return {
    tableName: process.env.ABSTRACT_PLAY_TABLE ?? '',
    docClient: ddbDocClient,
    stage: process.env.WEBSOCKET_STAGE ?? 'dev',
    limitsDisabled: process.env.WS_CONNECT_RATE_LIMITS === '0',
  };
}

export type EnforceWsConnectRateLimitResult =
  | { allowed: true }
  | { allowed: false; window: RateLimitWindow };

export async function enforceWsConnectRateLimit(
  sourceIp: string,
  depsIn?: Partial<WsConnectRateLimitDeps>,
): Promise<EnforceWsConnectRateLimitResult> {
  const deps = { ...defaultDeps(), ...depsIn };
  const ip = sourceIp.trim();
  if (deps.limitsDisabled || !deps.tableName || !ip) {
    return { allowed: true };
  }

  const multiplier = deps.stage === 'dev' ? DEV_LIMIT_MULTIPLIER : 1;
  const now = deps.now?.() ?? Date.now();
  const subjectHash = hashRateKey(ip);
  const pk = `${RATE_LIMIT_PK_PREFIX}${WS_CONNECT_SCOPE}#${subjectHash}`;

  for (const window of WINDOW_ORDER) {
    const limit = PROD_LIMITS[window] * multiplier;
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
      return { allowed: false, window };
    }
  }

  return { allowed: true };
}