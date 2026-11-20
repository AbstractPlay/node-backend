import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { enforceWsConnectRateLimit } from '../../lib/rateLimit/wsConnectLimits.js';

test('enforceWsConnectRateLimit applies prod minute/hour/day', async () => {
  const limits: number[] = [];
  let updates = 0;
  const client = {
    send: async (cmd: {
      input?: { ExpressionAttributeValues?: Record<string, number> };
    }) => {
      updates += 1;
      const lim = cmd.input?.ExpressionAttributeValues?.[':limit'];
      if (typeof lim === 'number') {
        limits.push(lim);
      }
      return {};
    },
  };
  await enforceWsConnectRateLimit('203.0.113.1', {
    tableName: 't',
    docClient: client as never,
    stage: 'prod',
    now: () => Date.UTC(2026, 10, 20, 12, 0, 0),
  });
  assert.deepEqual(limits, [12, 80, 300]);
  assert.equal(updates, 3);
});

test('enforceWsConnectRateLimit dev uses 10x caps', async () => {
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
  await enforceWsConnectRateLimit('203.0.113.1', {
    tableName: 't',
    docClient: client as never,
    stage: 'dev',
    now: () => Date.UTC(2026, 10, 20, 12, 0, 0),
  });
  assert.deepEqual(limits, [120, 800, 3000]);
});

test('enforceWsConnectRateLimit stops at first deny window', async () => {
  let updates = 0;
  const client = {
    send: async () => {
      updates += 1;
      if (updates === 1) {
        throw new ConditionalCheckFailedException({ message: 'fail', $metadata: {} });
      }
      return {};
    },
  };
  const res = await enforceWsConnectRateLimit('203.0.113.1', {
    tableName: 't',
    docClient: client as never,
    stage: 'prod',
    now: () => Date.UTC(2026, 10, 20, 12, 0, 0),
  });
  assert.equal(res.allowed, false);
  if (!res.allowed) {
    assert.equal(res.window, 'minute');
  }
  assert.equal(updates, 1);
});