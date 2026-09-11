import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DISCORD_IMPORT_AUTHOR_ID,
  planDiscordThreadImport,
  resolveDiscordAuthor,
  resolveExcludeTagIds,
  shouldImportThread,
  sortDiscordMessagesOldestFirst,
} from '../lib/feedback/discordImport.js';

const USER_MAP = { '111': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };

test('resolveExcludeTagIds maps tag names to ids', () => {
  const ids = resolveExcludeTagIds(
    [{ id: 't1', name: 'RESOLVED' }, { id: 't2', name: 'DONE' }],
    ['resolved', 'done'],
  );
  assert.equal(ids.size, 2);
  assert.ok(ids.has('t1'));
  assert.ok(ids.has('t2'));
});

test('shouldImportThread skips excluded tags', () => {
  const exclude = new Set(['t1']);
  assert.equal(shouldImportThread({ id: '1', name: 'Bug', owner_id: 'u', applied_tags: ['t1'] }, exclude), false);
  assert.equal(shouldImportThread({ id: '2', name: 'Bug', owner_id: 'u', applied_tags: ['t2'] }, exclude), true);
});

test('resolveDiscordAuthor prefers user map over username', () => {
  const mapped = resolveDiscordAuthor(
    { id: '111', username: 'alice' },
    { userMap: USER_MAP, usernameToUserId: { alice: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } },
  );
  assert.equal(mapped.authorId, USER_MAP['111']);

  const fromUsername = resolveDiscordAuthor(
    { id: '222', username: 'alice' },
    { userMap: {}, usernameToUserId: { alice: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } },
  );
  assert.equal(fromUsername.authorId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

  const legacy = resolveDiscordAuthor(
    { id: '333', username: 'stranger' },
    { userMap: {}, usernameToUserId: {} },
  );
  assert.equal(legacy.authorId, DISCORD_IMPORT_AUTHOR_ID);
  assert.equal(legacy.legacyDiscordUserId, '333');
});

test('planDiscordThreadImport builds meta and chronological comments', () => {
  const thread = {
    id: 'thread-1',
    name: 'Board does not load',
    owner_id: '111',
    thread_metadata: { create_timestamp: '2024-01-01T12:00:00.000Z' },
  };
  const messages = sortDiscordMessagesOldestFirst([
    {
      id: 'm2',
      author: { id: '999', username: 'staff', bot: true },
      content: 'Thanks, we are looking into it.',
      timestamp: '2024-01-02T12:00:00.000Z',
    },
    {
      id: 'm1',
      author: { id: '111', username: 'alice', global_name: 'Alice' },
      content: 'The board is blank after refresh.',
      timestamp: '2024-01-01T12:05:00.000Z',
      attachments: [{ id: 'a1', url: 'https://cdn.discordapp.com/attachments/1.png', filename: 'shot.png' }],
    },
  ]);

  const planned = planDiscordThreadImport({
    kind: 'bug',
    thread,
    messagesNewestFirst: messages,
    userMap: USER_MAP,
    postId: 'post-test-1',
  });
  if ('ok' in planned) {
    assert.fail(planned.message);
  }

  assert.equal(planned.meta.kind, 'bug');
  assert.equal(planned.meta.title, 'Board does not load');
  assert.equal(planned.meta.legacyDiscordThreadId, 'thread-1');
  assert.equal(planned.meta.authorId, USER_MAP['111']);
  assert.equal(planned.meta.commentCount, 1);
  assert.equal(planned.comments.length, 1);
  assert.equal(planned.comments[0]?.isStaff, true);
  assert.equal(planned.comments[0]?.legacyDiscordMessageId, 'm2');
  assert.match(planned.meta.body ?? '', /shot\.png/);
  assert.equal(planned.listRows.length, 3);
});

test('planDiscordThreadImport supports feature threads', () => {
  const planned = planDiscordThreadImport({
    kind: 'feature',
    thread: { id: 'thread-2', name: 'Dark mode', owner_id: '333' },
    messagesNewestFirst: [{
      id: 'm1',
      author: { id: '333', username: 'bob' },
      content: 'Please add dark mode.',
      timestamp: '2024-02-01T10:00:00.000Z',
    }],
    userMap: {},
  });
  if ('ok' in planned) {
    assert.fail(planned.message);
  }
  assert.equal(planned.meta.kind, 'feature');
  assert.equal(planned.meta.status, 'open');
});
