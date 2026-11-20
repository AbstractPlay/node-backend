import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import {
  consumeFixedWindowLimit,
  type RateLimitWindow,
  windowExpiresAtSec,
  windowSortKey,
} from './fixedWindow.js';
import { hashRateKey } from './hashKey.js';

const RATE_LIMIT_PK_PREFIX = 'RATELIMIT#auth#';
export const AUTH_WRITE_GLOBAL_SCOPE = 'auth_write_global';

const WINDOW_ORDER: RateLimitWindow[] = ['minute', 'hour', 'day'];

type FixedWindowLimits = Partial<Record<RateLimitWindow, number>>;

/** Prod caps — calibrated from CloudWatch auth_query 2026-11-19→20; dev ×10. */
const PROD_SCOPE_LIMITS: Record<string, FixedWindowLimits> = {
  auth_write_exploration: { minute: 40, hour: 700, day: 2_500 },
  auth_write_move: { minute: 12, hour: 50, day: 200 },
  auth_write_create: { minute: 6, hour: 20, day: 50 },
  auth_write_comment: { minute: 15, hour: 60, day: 200 },
  [AUTH_WRITE_GLOBAL_SCOPE]: { minute: 40, hour: 650, day: 2_500 },
};

const DEV_LIMIT_MULTIPLIER = 10;

export const AUTH_READ_EXEMPT_QUERIES = [
  'me',
  'me_profile',
  'me_dashboard',
  'next_game',
  'my_settings',
  'get_game',
  'get_exploration',
  'get_private_exploration',
  'get_challenge_position_preview',
  'get_arena_table',
  'get_my_arena_table',
  'get_ladder',
  'list_notifications',
  'list_playground_saves',
  'get_playground_save',
  'standing_challenges',
  'all_standing_challenges',
  'feedback_get',
  'feedback_tag_vocab',
  'feedback_mine',
  'feedback_admin_list',
  'announcement_get',
  'announcement_reactions_mine',
  'announcements_admin_list',
  'test_bot_status',
  'set_lastSeen',
] as const;

export const AUTH_ADMIN_WRITE_EXEMPT_QUERIES = [
  'update_meta_game_counts',
  'purge_retired_completed_games',
  'mark_published',
  'onetime_fix',
  'fix_games',
  'test_async',
  'delete_games',
  'admin_set_game_rating_exclusions',
  'feedback_set_status',
  'feedback_reclassify',
  'feedback_set_admin_fields',
  'feedback_merge',
  'feedback_delete',
  'feedback_hold_retention',
  'feedback_set_tag_vocab',
  'announcement_save',
  'announcement_presign_upload',
  'announcement_publish',
  'announcement_retract',
] as const;

/** Primary scoped bucket per query (global scope always applies for writes). */
export const AUTH_WRITE_SCOPED_QUERIES: Record<string, string> = {
  submit_move: 'auth_write_move',
  submit_arena_move: 'auth_write_move',
  save_exploration: 'auth_write_exploration',
  new_challenge: 'auth_write_create',
  start_solo_game: 'auth_write_create',
  create_arena_table: 'auth_write_create',
  new_ladder: 'auth_write_create',
  new_tournament: 'auth_write_create',
  event_create: 'auth_write_create',
  create_playground_save: 'auth_write_create',
  submit_comment: 'auth_write_comment',
  submit_ladder_comment: 'auth_write_comment',
  submit_tournament_comment: 'auth_write_comment',
};

const READ_EXEMPT_SET = new Set<string>(AUTH_READ_EXEMPT_QUERIES);
const ADMIN_EXEMPT_SET = new Set<string>(AUTH_ADMIN_WRITE_EXEMPT_QUERIES);

export type AuthWriteRateLimitDeps = {
  tableName: string;
  docClient: DynamoDBDocumentClient;
  now?: () => number;
  stage?: string;
  limitsDisabled?: boolean;
};

function defaultDeps(): AuthWriteRateLimitDeps {
  return {
    tableName: process.env.ABSTRACT_PLAY_TABLE ?? '',
    docClient: ddbDocClient,
    stage: process.env.WEBSOCKET_STAGE ?? 'dev',
    limitsDisabled: process.env.AUTH_WRITE_RATE_LIMITS === '0',
  };
}

export function isAuthQueryReadExempt(queryName: string | undefined): boolean {
  if (!queryName) {
    return false;
  }
  return READ_EXEMPT_SET.has(queryName);
}

export function isAuthQueryAdminWriteExempt(queryName: string | undefined): boolean {
  if (!queryName) {
    return false;
  }
  return ADMIN_EXEMPT_SET.has(queryName);
}

export function resolveAuthWriteRateLimitScopes(queryName: string | undefined): string[] {
  if (!queryName || isAuthQueryReadExempt(queryName) || isAuthQueryAdminWriteExempt(queryName)) {
    return [];
  }
  const scopes: string[] = [];
  const primary = AUTH_WRITE_SCOPED_QUERIES[queryName];
  if (primary) {
    scopes.push(primary);
  }
  if (!scopes.includes(AUTH_WRITE_GLOBAL_SCOPE)) {
    scopes.push(AUTH_WRITE_GLOBAL_SCOPE);
  }
  return scopes;
}

export type EnforceAuthWriteRateLimitResult =
  | { allowed: true }
  | { allowed: false; scope: string; window: RateLimitWindow };

export async function enforceAuthWriteRateLimit(
  sub: string | undefined,
  queryName: string | undefined,
  depsIn?: Partial<AuthWriteRateLimitDeps>,
): Promise<EnforceAuthWriteRateLimitResult> {
  const deps = { ...defaultDeps(), ...depsIn };
  const userSub = typeof sub === 'string' ? sub.trim() : '';
  if (deps.limitsDisabled || !deps.tableName || !userSub || !queryName) {
    return { allowed: true };
  }

  const scopes = resolveAuthWriteRateLimitScopes(queryName);
  if (scopes.length === 0) {
    return { allowed: true };
  }

  const multiplier = deps.stage === 'dev' ? DEV_LIMIT_MULTIPLIER : 1;
  const now = deps.now?.() ?? Date.now();
  const subjectHash = hashRateKey(userSub);

  for (const scope of scopes) {
    const base = PROD_SCOPE_LIMITS[scope];
    if (!base) {
      continue;
    }
    const pk = `${RATE_LIMIT_PK_PREFIX}${scope}#${subjectHash}`;
    for (const window of WINDOW_ORDER) {
      const limit = base[window];
      if (limit === undefined) {
        continue;
      }
      const effectiveLimit = limit * multiplier;
      const sk = windowSortKey(now, window);
      const result = await consumeFixedWindowLimit({
        tableName: deps.tableName,
        client: deps.docClient,
        pk,
        sk,
        limit: effectiveLimit,
        expiresAtSec: windowExpiresAtSec(now, window),
        layer: 'auth',
      });
      if (!result.allowed) {
        return { allowed: false, scope, window };
      }
    }
  }

  return { allowed: true };
}