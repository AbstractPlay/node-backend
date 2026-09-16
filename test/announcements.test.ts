import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  announcementsList,
  announcementGet,
  putAnnouncementRecord,
} from '../lib/announcements/access.js';
import { announcementPublish, announcementSave } from '../lib/announcements/admin.js';
import { publishedIndexSk } from '../lib/announcements/keys.js';
import {
  normalizeDiscordContent,
  shouldImportMessage,
  titleFromBody,
} from '../lib/announcements/discordImport.js';
import { buildAnnouncementsRss } from '../lib/announcements/rss.js';
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
  const result = await announcementPublish(client, 'table', 'x');
  process.env.WEBSOCKET_STAGE = prev;
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'announcements_publish_disabled_on_dev');
    assert.equal(result.statusCode, 403);
  }
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
