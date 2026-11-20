import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  extractConnectToken,
  extractSourceIp,
  handleWsAuthorizer,
  type WebSocketAuthorizerEvent,
} from '../api/sockets/wsAuthorizer.js';

const METHOD_ARN = 'arn:aws:execute-api:us-east-1:123456789012:abc123/prod/$connect';

function baseEvent(overrides: Partial<WebSocketAuthorizerEvent> = {}): WebSocketAuthorizerEvent {
  return {
    methodArn: METHOD_ARN,
    queryStringParameters: { token: 'valid.jwt.token' },
    requestContext: { identity: { sourceIp: '203.0.113.10' } },
    ...overrides,
  };
}

test('extractConnectToken prefers query string then identitySource', () => {
  assert.equal(extractConnectToken({ methodArn: METHOD_ARN, queryStringParameters: { token: 'a' } }), 'a');
  assert.equal(extractConnectToken({ methodArn: METHOD_ARN, identitySource: ['b'] }), 'b');
  assert.equal(extractConnectToken({ methodArn: METHOD_ARN }), undefined);
});

test('extractSourceIp reads requestContext.identity.sourceIp', () => {
  assert.equal(
    extractSourceIp({ methodArn: METHOD_ARN, requestContext: { identity: { sourceIp: ' 1.2.3.4 ' } } }),
    '1.2.3.4',
  );
});

test('handleWsAuthorizer denies missing token', async () => {
  const res = await handleWsAuthorizer(baseEvent({ queryStringParameters: {} }), {
    verifyToken: async () => ({ sub: 'user-1' }),
    enforceRateLimit: async () => ({ allowed: true }),
  });
  assert.equal(res.policyDocument.Statement[0]?.Effect, 'Deny');
});

test('handleWsAuthorizer denies invalid jwt', async () => {
  const res = await handleWsAuthorizer(baseEvent(), {
    verifyToken: async () => {
      throw new Error('bad jwt');
    },
    enforceRateLimit: async () => ({ allowed: true }),
  });
  assert.equal(res.policyDocument.Statement[0]?.Effect, 'Deny');
});

test('handleWsAuthorizer allows valid jwt under rate cap', async () => {
  const res = await handleWsAuthorizer(baseEvent(), {
    verifyToken: async () => ({ sub: 'user-abc' }),
    enforceRateLimit: async () => ({ allowed: true }),
  });
  assert.equal(res.policyDocument.Statement[0]?.Effect, 'Allow');
  assert.equal(res.principalId, 'user-abc');
  assert.equal(res.context?.userId, 'user-abc');
});

test('handleWsAuthorizer denies when rate limit exceeded', async () => {
  const res = await handleWsAuthorizer(baseEvent(), {
    verifyToken: async () => ({ sub: 'user-abc' }),
    enforceRateLimit: async () => ({ allowed: false, window: 'minute' }),
  });
  assert.equal(res.policyDocument.Statement[0]?.Effect, 'Deny');
});