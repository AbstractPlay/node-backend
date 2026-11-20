import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { authRoutes } from '../../api/routes/auth/index.js';
import {
  AUTH_WRITE_GLOBAL_SCOPE,
  AUTH_WRITE_SCOPED_QUERIES,
  enforceAuthWriteRateLimit,
  isAuthQueryAdminWriteExempt,
  isAuthQueryReadExempt,
  resolveAuthWriteRateLimitScopes,
} from '../../lib/rateLimit/authWriteLimits.js';

test('isAuthQueryReadExempt includes dashboard reads', () => {
  assert.equal(isAuthQueryReadExempt('me_dashboard'), true);
  assert.equal(isAuthQueryReadExempt('submit_move'), false);
  assert.equal(isAuthQueryReadExempt('set_lastSeen'), true);
});

test('resolveAuthWriteRateLimitScopes stacks scoped + global', () => {
  assert.deepEqual(resolveAuthWriteRateLimitScopes('submit_move'), [
    'auth_write_move',
    AUTH_WRITE_GLOBAL_SCOPE,
  ]);
  assert.deepEqual(resolveAuthWriteRateLimitScopes('dismiss_notification'), [
    AUTH_WRITE_GLOBAL_SCOPE,
  ]);
  assert.deepEqual(resolveAuthWriteRateLimitScopes('me_profile'), []);
});

test('enforceAuthWriteRateLimit skips read-exempt queries', async () => {
  const client = {
    send: async () => {
      throw new Error('should not call DDB');
    },
  };
  const res = await enforceAuthWriteRateLimit(
    'sub-1',
    'get_game',
    { tableName: 't', docClient: client as never, stage: 'prod' },
  );
  assert.equal(res.allowed, true);
});

test('enforceAuthWriteRateLimit denies on second window', async () => {
  let updates = 0;
  const client = {
    send: async () => {
      updates += 1;
      if (updates === 2) {
        throw new ConditionalCheckFailedException({ message: 'fail', $metadata: {} });
      }
      return {};
    },
  };
  const res = await enforceAuthWriteRateLimit(
    'sub-1',
    'submit_move',
    {
      tableName: 't',
      docClient: client as never,
      stage: 'prod',
      now: () => Date.UTC(2026, 10, 19, 12, 0, 0),
    },
  );
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.scope, 'auth_write_move');
    assert.equal(res.window, 'hour');
  }
});

test('enforceAuthWriteRateLimit applies dev multiplier on move minute cap', async () => {
  const limits: number[] = [];
  const client = {
    send: async (cmd: {
      input?: { ExpressionAttributeValues?: Record<string, number> };
    }) => {
      const lim = cmd.input?.ExpressionAttributeValues?.[':limit'];
      if (typeof lim === 'number') {
        limits.push(lim);
      }
      return {};
    },
  };
  await enforceAuthWriteRateLimit(
    'sub-1',
    'submit_arena_move',
    {
      tableName: 't',
      docClient: client as never,
      stage: 'dev',
      now: () => Date.UTC(2026, 10, 19, 12, 0, 0),
    },
  );
  assert.ok(limits.length >= 1);
  assert.equal(limits[0], 12 * 10);
});

test('every auth route is read/admin exempt or subject to write limits', () => {
  for (const name of Object.keys(authRoutes)) {
    const read = isAuthQueryReadExempt(name);
    const admin = isAuthQueryAdminWriteExempt(name);
    assert.ok(
      read || admin || resolveAuthWriteRateLimitScopes(name).length > 0,
      `unclassified auth route: ${name}`,
    );
  }
});

test('scoped query keys exist on authRoutes', () => {
  for (const queryName of Object.keys(AUTH_WRITE_SCOPED_QUERIES)) {
    assert.ok(queryName in authRoutes, `scoped query missing from authRoutes: ${queryName}`);
    assert.ok(!isAuthQueryReadExempt(queryName), `scoped query must not be read-exempt: ${queryName}`);
    assert.ok(!isAuthQueryAdminWriteExempt(queryName), `scoped query must not be admin-exempt: ${queryName}`);
  }
});