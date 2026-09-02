import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  RECOMMENDATION_EVENTS_PER_DAY_LIMIT,
  logRecommendationEvent,
  recommendationEventsPk,
  validateRecommendationEventPars,
} from '../lib/recommendationEvents.js';

const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const BATCH_ID = '550e8400-e29b-41d4-a716-446655440000';

function itemKey(item: { pk: string; sk: string }) {
  return `${item.pk}:${item.sk}`;
}

function createMockDocClient(store: Map<string, Record<string, unknown>>) {
  return {
    async send(command: unknown) {
      if (command instanceof PutCommand) {
        const item = command.input.Item as { pk: string; sk: string };
        store.set(itemKey(item), { ...item });
        return {};
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'];
        const dayStart = command.input.ExpressionAttributeValues?.[':dayStart'];
        const items = [...store.values()].filter((item) => {
          if (item.pk !== pk) {
            return false;
          }
          if (dayStart !== undefined) {
            const skPrefix = String(item.sk).split('#')[0];
            return Number(skPrefix) >= Number(dayStart);
          }
          return true;
        });
        if (command.input.Select === 'COUNT') {
          return { Count: items.length };
        }
        return { Items: items };
      }
      throw new Error(`Unexpected command: ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  };
}

test('recommendationEventsPk uses RECOMMENDS# prefix', () => {
  assert.equal(recommendationEventsPk(USER_ID), `RECOMMENDS#${USER_ID}`);
});

test('validateRecommendationEventPars accepts rec_show payload', () => {
  const result = validateRecommendationEventPars({
    event: 'rec_show',
    batchId: BATCH_ID,
    surface: 'gamePicker',
    tier: 'warm',
    gameIds: ['go', 'amazons'],
    reasons: ['Similar to Go', 'Popular this week'],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.event, 'rec_show');
    assert.deepEqual(result.data.gameIds, ['go', 'amazons']);
    assert.deepEqual(result.data.reasons, ['Similar to Go', 'Popular this week']);
    assert.ok(result.data.expiresAt > Math.floor(Date.now() / 1000));
  }
});

test('validateRecommendationEventPars accepts rec_click payload', () => {
  const result = validateRecommendationEventPars({
    event: 'rec_click',
    batchId: BATCH_ID,
    surface: 'gamePicker',
    tier: 'warm',
    metaGame: 'amazons',
    position: 2,
    reasonType: 'cooccur',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.metaGame, 'amazons');
    assert.equal(result.data.position, 2);
    assert.equal(result.data.reasonType, 'cooccur');
  }
});

test('validateRecommendationEventPars rejects invalid event', () => {
  const result = validateRecommendationEventPars({
    event: 'rec_bad',
    batchId: BATCH_ID,
    surface: 'gamePicker',
    tier: 'warm',
  });
  assert.equal(result.ok, false);
});

test('logRecommendationEvent writes RECOMMENDS# partition key', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const result = await logRecommendationEvent(client, TABLE, USER_ID, {
    event: 'rec_click',
    batchId: BATCH_ID,
    surface: 'gamePicker',
    tier: 'cold',
    metaGame: 'hex',
    position: 0,
    reasonType: 'popularity',
  });
  assert.equal(result.ok, true);
  const written = [...store.values()][0];
  assert.equal(written.pk, `RECOMMENDS#${USER_ID}`);
  assert.equal(written.event, 'rec_click');
  assert.equal(written.metaGame, 'hex');
  assert.ok((written.expiresAt as number) > Math.floor(Date.now() / 1000));
});

test('logRecommendationEvent enforces daily rate limit', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const dayStart = String(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  for (let i = 0; i < RECOMMENDATION_EVENTS_PER_DAY_LIMIT; i += 1) {
    store.set(`RECOMMENDS#${USER_ID}:${dayStart}#${i}`, {
      pk: `RECOMMENDS#${USER_ID}`,
      sk: `${dayStart}#${i}`,
    });
  }
  const result = await logRecommendationEvent(client, TABLE, USER_ID, {
    event: 'rec_challenge',
    batchId: BATCH_ID,
    surface: 'explore',
    tier: 'warm',
    metaGame: 'go',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /rate limit/i);
  }
});
