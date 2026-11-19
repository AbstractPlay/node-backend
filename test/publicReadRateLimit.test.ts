import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  enforcePublicReadRateLimit,
  resolvePublicReadLimitScope,
} from '../lib/rateLimit/publicReadLimits.js';

test('resolvePublicReadLimitScope splits user_names all flag', () => {
  assert.equal(resolvePublicReadLimitScope('user_names', {}), 'user_names');
  assert.equal(resolvePublicReadLimitScope('user_names', { all: true }), 'user_names_all');
  assert.equal(resolvePublicReadLimitScope('games', {}), null);
});

test('enforcePublicReadRateLimit skips unlisted queries', async () => {
  const client = {
    send: async () => {
      throw new Error('should not call DDB');
    },
  };
  const res = await enforcePublicReadRateLimit(
    'games',
    { _clientIp: '203.0.113.1' },
    { tableName: 't', docClient: client as never, stage: 'prod' },
  );
  assert.equal(res.allowed, true);
});

test('enforcePublicReadRateLimit runs minute hour day until deny', async () => {
  const scopes: string[] = [];
  let updates = 0;
  const client = {
    send: async (cmd: { input?: { Key?: { sk?: string } } }) => {
      updates += 1;
      const sk = cmd.input?.Key?.sk ?? '';
      scopes.push(sk);
      if (updates === 2) {
        throw new ConditionalCheckFailedException({ message: 'fail', $metadata: {} });
      }
      return {};
    },
  };
  const res = await enforcePublicReadRateLimit(
    'standing_challenges',
    { _clientIp: '203.0.113.1' },
    {
      tableName: 't',
      docClient: client as never,
      stage: 'prod',
      now: () => Date.UTC(2026, 10, 19, 12, 0, 0),
    },
  );
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.scope, 'standing_challenges');
    assert.equal(res.window, 'hour');
  }
  assert.equal(updates, 2);
  assert.match(scopes[0]!, /Z$/);
  assert.match(scopes[1]!, /T\d{2}$/);
});

test('enforcePublicReadRateLimit applies dev multiplier', async () => {
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
  await enforcePublicReadRateLimit(
    'recent_completed_games',
    { _clientIp: '203.0.113.1' },
    {
      tableName: 't',
      docClient: client as never,
      stage: 'dev',
      now: () => Date.UTC(2026, 10, 19, 12, 0, 0),
    },
  );
  assert.deepEqual(limits, [150, 900, 4000]);
});