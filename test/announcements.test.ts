import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  announcementsList,
  announcementGet,
  putAnnouncementRecord,
} from '../lib/announcements/access.js';
import { announcementPublish, announcementRetract, announcementSave } from '../lib/announcements/admin.js';
import {
  syncAnnouncementNotifyIndex,
  listAnnouncementNotifyUserIds,
  userWantsAnnouncementNotifications,
} from '../lib/announcements/announcementNotifyIndex.js';
import { publishedIndexSk } from '../lib/announcements/keys.js';
import {
  normalizeDiscordContent,
  shouldImportMessage,
  titleFromBody,
} from '../lib/announcements/discordImport.js';
import { buildAnnouncementsRss } from '../lib/announcements/rss.js';
import {
  DISCORD_EXCERPT_END_MARKER,
  plainTextDiscordExcerpt,
  removeDiscordExcerptMarker,
} from '../lib/announcements/discordExcerpt.js';
import { ANNOUNCEMENT_PK, ANNOUNCEMENT_PUBLISHED_PK } from '../lib/announcements/keys.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: async () => 'https://example.com/presigned',
}));

test('shouldImportMessage includes text or attachments', () => {
  assert.equal(shouldImportMessage({ id: '1', timestamp: '', content: '' }), false);
  assert.equal(shouldImportMessage({ id: '1', timestamp: '', content: 'hi' }), true);
  assert.equal(shouldImportMessage({
    id: '1',
    timestamp: '',
    content: '',
    attachments: [{ fileName: 'x.png' }],
  }), true);
});

test('titleFromBody uses first line', () => {
  assert.equal(titleFromBody('**Hello**\nrest'), 'Hello');
  assert.equal(titleFromBody(''), 'Announcement');
});

test('normalizeDiscordContent leaves unicode emoji text unchanged', () => {
  const body = 'Thanks 🙂';
  assert.equal(normalizeDiscordContent(body, [{ name: '🙂', id: '' }]), body);
});

test('plainTextDiscordExcerpt uses marker prefix with ellipsis', () => {
  const body = `**Hi** there\n${DISCORD_EXCERPT_END_MARKER}\nSecret rest`;
  assert.equal(plainTextDiscordExcerpt(body), 'Hi there…');
});

test('plainTextDiscordExcerpt defaults to 200 chars without marker', () => {
  const body = 'a'.repeat(250);
  assert.equal(plainTextDiscordExcerpt(body), `${'a'.repeat(199)}…`);
});

test('removeDiscordExcerptMarker strips marker only', () => {
  const body = `Line one\n${DISCORD_EXCERPT_END_MARKER}\nLine two`;
  assert.equal(removeDiscordExcerptMarker(body), 'Line one\n\nLine two');
});

test('announcementsList returns published index rows', async () => {
  const sends: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      sends.push(command);
      if (command instanceof QueryCommand) {
        return {
          Items: [{
            pk: ANNOUNCEMENT_PUBLISHED_PK,
            sk: publishedIndexSk(1000, 'abc'),
            id: 'abc',
            title: 'T',
            body: 'B',
            publishedAt: 1000,
            status: 'published',
          }],
        };
      }
      throw new Error('unexpected');
    },
  } as unknown as DynamoDBDocumentClient;

  const result = await announcementsList(client, 'table', { limit: 10 });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].id, 'abc');
});

test('announcementsList applies publishedAfter on sort key', async () => {
  let queryInput: Record<string, unknown> | undefined;
  const client = {
    send: async (command: unknown) => {
      if (command instanceof QueryCommand) {
        queryInput = command.input as Record<string, unknown>;
        return { Items: [] };
      }
      throw new Error('unexpected');
    },
  } as unknown as DynamoDBDocumentClient;

  const after = 1_700_000_000_000;
  const result = await announcementsList(client, 'table', { limit: 5, publishedAfter: after });
  assert.equal(result.ok, true);
  assert.match(String(queryInput?.KeyConditionExpression), /sk >= :skMin/);
  const values = queryInput?.ExpressionAttributeValues as Record<string, string>;
  assert.equal(values[':skMin'], `${String(after).padStart(13, '0')}#`);
});

test('announcementGet loads canonical row', async () => {
  const client = {
    send: async (command: unknown) => {
      if (command instanceof GetCommand) {
        return {
          Item: {
            pk: ANNOUNCEMENT_PK,
            sk: 'abc',
            id: 'abc',
            status: 'published',
            title: 'T',
            body: 'B',
            publishedAt: 1000,
          },
        };
      }
      throw new Error('unexpected');
    },
  } as unknown as DynamoDBDocumentClient;

  const result = await announcementGet(client, 'table', null, { id: 'abc' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.body, 'B');
  }
});

test('putAnnouncementRecord writes canonical and index', async () => {
  const puts: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      puts.push(command);
      return {};
    },
  } as unknown as DynamoDBDocumentClient;

  await putAnnouncementRecord(client, 'table', {
    id: '99',
    status: 'published',
    title: 'Hi',
    body: 'Body',
    publishedAt: 5000,
    createdAt: 5000,
    updatedAt: 5000,
    source: 'import-discord',
  });
  assert.equal(puts.length, 2);
  assert.ok(puts.every((c) => c instanceof PutCommand));
});

test('announcementPublish blocked on dev stage', async () => {
  const prev = process.env.WEBSOCKET_STAGE;
  process.env.WEBSOCKET_STAGE = 'dev';
  const client = {
    send: async () => ({ Item: undefined }),
  } as unknown as DynamoDBDocumentClient;
  const result = await announcementPublish(client, 'table', null, 'x');
  process.env.WEBSOCKET_STAGE = prev;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'announcements_publish_disabled_on_dev');
    assert.equal(result.statusCode, 403);
  }
});

test('userWantsAnnouncementNotifications defaults off', () => {
  assert.equal(userWantsAnnouncementNotifications(undefined), false);
  assert.equal(userWantsAnnouncementNotifications({ all: { notifications: {} } }), false);
  assert.equal(userWantsAnnouncementNotifications({
    all: { notifications: { announcements: true } },
  }), true);
});

test('syncAnnouncementNotifyIndex writes and lists opt-in user', async () => {
  const table = 'table';
  const store = new Map<string, Record<string, unknown>>();
  const key = (pk: string, sk: string) => `${pk}\0${sk}`;
  const client = {
    send: async (command: unknown) => {
      if (command instanceof PutCommand) {
        const input = command.input as { Item: Record<string, unknown> };
        const item = input.Item;
        store.set(key(String(item.pk), String(item.sk)), item);
        return {};
      }
      if (command instanceof DeleteCommand) {
        const input = command.input as unknown as { Key: { pk: string; sk: string } };
        store.delete(key(input.Key.pk, input.Key.sk));
        return {};
      }
      if (command instanceof QueryCommand) {
        const input = command.input as {
          ExpressionAttributeValues?: Record<string, string>;
        };
        const pk = input.ExpressionAttributeValues?.[':pk'];
        const items = [...store.values()].filter((item) => item.pk === pk);
        return { Items: items };
      }
      throw new Error('unexpected');
    },
  } as unknown as DynamoDBDocumentClient;

  await syncAnnouncementNotifyIndex(client, table, 'user-1', {
    all: { notifications: { announcements: true } },
  });
  let ids = await listAnnouncementNotifyUserIds(client, table);
  assert.deepEqual(ids, ['user-1']);

  await syncAnnouncementNotifyIndex(client, table, 'user-1', {
    all: { notifications: { announcements: false } },
  });
  ids = await listAnnouncementNotifyUserIds(client, table);
  assert.deepEqual(ids, []);
});

test('announcementRetract removes published index row', async () => {
  const prev = process.env.WEBSOCKET_STAGE;
  process.env.WEBSOCKET_STAGE = 'prod';
  const commands: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      commands.push(command);
      if (command instanceof GetCommand) {
        return {
          Item: {
            pk: ANNOUNCEMENT_PK,
            sk: 'abc',
            id: 'abc',
            status: 'published',
            title: 'T',
            body: 'B',
            publishedAt: 1000,
            createdAt: 1000,
            updatedAt: 1000,
            source: 'ap',
          },
        };
      }
      return {};
    },
  } as unknown as DynamoDBDocumentClient;

  const result = await announcementRetract(client, 'table', null, 'abc');
  process.env.WEBSOCKET_STAGE = prev;
  assert.equal(result.ok, true);
  assert.ok(commands.some((c) => c instanceof DeleteCommand));
});

test('announcementSave creates draft', async () => {
  const puts: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      if (command instanceof GetCommand) {
        return { Item: undefined };
      }
      puts.push(command);
      return {};
    },
  } as unknown as DynamoDBDocumentClient;

  const result = await announcementSave(client, 'table', {
    title: 'Hello',
    body: 'World',
  });
  assert.equal(result.ok, true);
  assert.equal(puts.length, 1);
});

test('buildAnnouncementsRss includes guid', () => {
  const xml = buildAnnouncementsRss([{
    id: 'snowflake-id',
    title: 'T',
    body: 'B',
    publishedAt: Date.UTC(2023, 0, 1),
  }]);
  assert.match(xml, /snowflake-id/);
  assert.match(xml, /<title>T<\/title>/);
});
