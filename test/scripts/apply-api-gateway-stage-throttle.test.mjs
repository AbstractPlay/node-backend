import assert from 'node:assert/strict';
import test from 'node:test';
import { applyApiGatewayStageThrottle } from '../../scripts/apply-api-gateway-stage-throttle.mjs';

test('skips dev when not configured', async () => {
  const client = { send: async () => ({}) };
  let calls = 0;
  client.send = async () => {
    calls += 1;
    return {};
  };
  await applyApiGatewayStageThrottle({ stage: 'dev', dryRun: false }, { client });
  assert.equal(calls, 0);
});

test('patches prod stage limits', async () => {
  const calls = [];
  const client = {
    send: async (cmd) => {
      calls.push(cmd);
      if (cmd.input?.patchOperations) {
        return {};
      }
      return {
        methodSettings: { '*/*': { throttlingRateLimit: 10000 } },
      };
    },
  };
  await applyApiGatewayStageThrottle(
    { stage: 'prod', dryRun: false },
    { client, restApiId: 'abc123' },
  );
  assert.equal(calls.length, 2);
  const update = calls.find((cmd) => cmd.input?.patchOperations);
  assert.deepEqual(update.input.patchOperations, [
    { op: 'replace', path: '/*/*/throttling/rateLimit', value: '25' },
    { op: 'replace', path: '/*/*/throttling/burstLimit', value: '75' },
  ]);
});