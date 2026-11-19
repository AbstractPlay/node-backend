import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  consumeFixedWindowLimit,
  windowSortKey,
} from '../../lib/rateLimit/fixedWindow.js';

test('windowSortKey buckets UTC minute hour day', () => {
  const ms = Date.UTC(2026, 10, 19, 16, 7, 0);
  assert.equal(windowSortKey(ms, 'minute'), '2026-11-19T16:07Z');
  assert.equal(windowSortKey(ms, 'hour'), '2026-11-19T16');
  assert.equal(windowSortKey(ms, 'day'), '2026-11-19');
});

test('consumeFixedWindowLimit allows increment under limit', async () => {
  let updateCount = 0;
  const client = {
    send: async () => {
      updateCount += 1;
      return {};
    },
  };
  const result = await consumeFixedWindowLimit({
    tableName: 't',
    client: client as never,
    pk: 'RATELIMIT#public#user_names#abc',
    sk: '2026-11-19T16:00Z',
    limit: 10,
    expiresAtSec: 1_700_000_000,
  });
  assert.equal(result.allowed, true);
  assert.equal(updateCount, 1);
});

test('consumeFixedWindowLimit denies at limit without fail-open', async () => {
  const client = {
    send: async () => {
      throw new ConditionalCheckFailedException({ message: 'fail', $metadata: {} });
    },
  };
  const result = await consumeFixedWindowLimit({
    tableName: 't',
    client: client as never,
    pk: 'RATELIMIT#public#user_names#abc',
    sk: '2026-11-19T16:00Z',
    limit: 1,
    expiresAtSec: 1_700_000_000,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'limit');
});

test('consumeFixedWindowLimit fail-open on other errors', async () => {
  const client = {
    send: async () => {
      throw new Error('ThrottlingException');
    },
  };
  const result = await consumeFixedWindowLimit({
    tableName: 't',
    client: client as never,
    pk: 'RATELIMIT#public#user_names#abc',
    sk: '2026-11-19T16:00Z',
    limit: 10,
    expiresAtSec: 1_700_000_000,
  });
  assert.equal(result.allowed, true);
  assert.ok('failOpen' in result && result.failOpen === true);
});