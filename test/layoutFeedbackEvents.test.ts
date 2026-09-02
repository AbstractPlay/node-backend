import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH,
  layoutFeedbackEventsPk,
  logLayoutFeedbackEvent,
  validateLayoutFeedbackEventPars,
} from '../lib/layoutFeedbackEvents.js';

const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';

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
      throw new Error(`Unexpected command: ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  };
}

test('layoutFeedbackEventsPk uses LAYOUTFB# prefix', () => {
  assert.equal(layoutFeedbackEventsPk(USER_ID), `LAYOUTFB#${USER_ID}`);
});

test('validateLayoutFeedbackEventPars accepts session_start', () => {
  const result = validateLayoutFeedbackEventPars({
    event: 'session_start',
    layoutId: 'card',
    gameId: 'game-1',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.event, 'session_start');
    assert.equal(result.data.layoutId, 'card');
    assert.equal(result.data.gameId, 'game-1');
  }
});

test('validateLayoutFeedbackEventPars accepts feedback with rating', () => {
  const result = validateLayoutFeedbackEventPars({
    event: 'feedback',
    layoutId: 'strip',
    rating: 'up',
    durationMs: 12000,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.rating, 'up');
    assert.equal(result.data.durationMs, 12000);
  }
});

test('validateLayoutFeedbackEventPars accepts feedback_note with comment', () => {
  const result = validateLayoutFeedbackEventPars({
    event: 'feedback_note',
    layoutId: 'narrative',
    comment: '  Hard to find submit  ',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.comment, 'Hard to find submit');
  }
});

test('validateLayoutFeedbackEventPars rejects empty feedback_note comment', () => {
  const result = validateLayoutFeedbackEventPars({
    event: 'feedback_note',
    layoutId: 'card',
    comment: '   ',
  });
  assert.equal(result.ok, false);
});

test('validateLayoutFeedbackEventPars rejects comment over max length', () => {
  const result = validateLayoutFeedbackEventPars({
    event: 'feedback_note',
    layoutId: 'card',
    comment: 'x'.repeat(LAYOUT_FEEDBACK_MAX_COMMENT_LENGTH + 1),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /500/);
  }
});

test('validateLayoutFeedbackEventPars accepts layout_switch', () => {
  const result = validateLayoutFeedbackEventPars({
    event: 'layout_switch',
    layoutId: 'strip',
    toLayoutId: 'card',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.toLayoutId, 'card');
  }
});

test('logLayoutFeedbackEvent writes LAYOUTFB# partition key without expiresAt', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const result = await logLayoutFeedbackEvent(client, TABLE, USER_ID, {
    event: 'feedback',
    layoutId: 'card',
    rating: 'down',
  });
  assert.equal(result.ok, true);
  const written = [...store.values()][0];
  assert.equal(written.pk, `LAYOUTFB#${USER_ID}`);
  assert.equal(written.event, 'feedback');
  assert.equal(written.rating, 'down');
  assert.equal(written.expiresAt, undefined);
});
