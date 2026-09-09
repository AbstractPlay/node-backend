import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  LAYOUT_EVENTS_ANON_PER_DAY_LIMIT,
  LAYOUT_EVENTS_PER_DAY_LIMIT,
  layoutEventUserHash,
  layoutEventsAnonPk,
  layoutEventsPk,
  logLayoutEvent,
  validateLayoutEventPars,
} from '../lib/layoutEvents.js';

const TABLE = 'abstract-play-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

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

test('layoutEventsPk uses LAYOUTEVT# prefix', () => {
  assert.equal(layoutEventsPk(USER_ID), `LAYOUTEVT#${USER_ID}`);
});

test('layoutEventsAnonPk scopes anonymous sessions', () => {
  assert.equal(layoutEventsAnonPk(SESSION_ID), `LAYOUTEVT#anon#${SESSION_ID}`);
});

test('validateLayoutEventPars accepts session_start payload', () => {
  const result = validateLayoutEventPars({
    event: 'session_start',
    sessionId: SESSION_ID,
    layout: 'strip',
    resolvedFrom: 'default',
    metaGame: 'amazons',
    viewportWidth: 1280,
    storedLayout: 'card',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.event, 'session_start');
    assert.equal(result.data.layout, 'strip');
    assert.equal(result.data.storedLayout, 'card');
    assert.equal(result.data.viewportWidth, 1280);
  }
});

test('validateLayoutEventPars normalizes queue to card', () => {
  const result = validateLayoutEventPars({
    event: 'layout_switch',
    sessionId: SESSION_ID,
    layout: 'strip',
    resolvedFrom: 'localStorage',
    metaGame: 'go',
    from: 'queue',
    to: 'classic',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.from, 'card');
    assert.equal(result.data.to, 'classic');
  }
});

test('logLayoutEvent writes authed partition with userHash and server ts', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const result = await logLayoutEvent(client, TABLE, USER_ID, {
    event: 'session_start',
    sessionId: SESSION_ID,
    layout: 'strip',
    resolvedFrom: 'default',
    metaGame: 'amazons',
  });
  assert.equal(result.ok, true);
  const written = [...store.values()][0];
  assert.equal(written.pk, `LAYOUTEVT#${USER_ID}`);
  assert.equal(written.userHash, layoutEventUserHash(USER_ID));
  assert.equal(written.isLoggedIn, true);
  assert.ok(typeof written.ts === 'number');
});

test('logLayoutEvent writes anonymous partition without userHash', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const result = await logLayoutEvent(client, TABLE, undefined, {
    event: 'session_start',
    sessionId: SESSION_ID,
    layout: 'classic',
    resolvedFrom: 'url',
    metaGame: 'hex',
  });
  assert.equal(result.ok, true);
  const written = [...store.values()][0];
  assert.equal(written.pk, `LAYOUTEVT#anon#${SESSION_ID}`);
  assert.equal(written.isLoggedIn, false);
  assert.equal(written.userHash, undefined);
});

test('logLayoutEvent enforces authed daily rate limit', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const dayStart = String(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  for (let i = 0; i < LAYOUT_EVENTS_PER_DAY_LIMIT; i += 1) {
    store.set(`LAYOUTEVT#${USER_ID}:${dayStart}#${i}`, {
      pk: `LAYOUTEVT#${USER_ID}`,
      sk: `${dayStart}#${i}`,
    });
  }
  const result = await logLayoutEvent(client, TABLE, USER_ID, {
    event: 'session_start',
    sessionId: SESSION_ID,
    layout: 'strip',
    resolvedFrom: 'default',
    metaGame: 'amazons',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /rate limit/i);
  }
});

test('logLayoutEvent enforces anonymous daily rate limit', async () => {
  const store = new Map<string, Record<string, unknown>>();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const dayStart = String(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const pk = layoutEventsAnonPk(SESSION_ID);
  for (let i = 0; i < LAYOUT_EVENTS_ANON_PER_DAY_LIMIT; i += 1) {
    store.set(`${pk}:${dayStart}#${i}`, {
      pk,
      sk: `${dayStart}#${i}`,
    });
  }
  const result = await logLayoutEvent(client, TABLE, undefined, {
    event: 'session_start',
    sessionId: SESSION_ID,
    layout: 'strip',
    resolvedFrom: 'default',
    metaGame: 'amazons',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /rate limit/i);
  }
});
