import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  archivePost,
  buildHistorySummaryFromMeta,
  findPostsReadyForArchive,
} from '../lib/feedback/archive.js';
import { feedbackGet, feedbackHistoryList, feedbackHoldRetention, seedFeedbackPostForTests } from '../lib/feedback/access.js';
import { buildMetaItem, buildListIndexItem } from '../lib/feedback/access.js';
import { historyPk, metaSk, postPk, statusGsi2Pk } from '../lib/feedback/keys.js';

const TABLE = 'abstract-play-feedback-archive-test';
const ADMIN_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';

process.env.FEEDBACK_ATTACHMENTS_BUCKET = 'ap-feedback-attachments-test';
process.env.ABSTRACT_PLAY_TABLE = TABLE;

type Store = Map<string, Record<string, unknown>>;
const s3Objects = new Set<string>();

function itemKey(item: { pk: string; sk: string }) {
  return `${item.pk}:${item.sk}`;
}

function applyTransact(store: Store, command: TransactWriteCommand) {
  for (const action of command.input.TransactItems ?? []) {
    if (action.Put) {
      const item = action.Put.Item as { pk: string; sk: string };
      store.set(itemKey(item), { ...item });
    }
  }
}

function applyUpdate(existing: Record<string, unknown>, updateExpression: string, values: Record<string, unknown>) {
  if (updateExpression.includes('REMOVE retentionHold')) {
    delete existing.retentionHold;
    return;
  }
  const setPart = updateExpression.replace(/^SET\s+/i, '').split(' REMOVE ')[0] ?? '';
  for (const assignment of setPart.split(',')) {
    const [field, placeholder] = assignment.trim().split(/\s*=\s*/);
    if (field && placeholder) {
      existing[field] = values[placeholder];
    }
  }
}

function createMockDocClient(store: Store) {
  return {
    async send(command: unknown) {
      if (command instanceof PutCommand) {
        const item = command.input.Item as { pk: string; sk: string };
        store.set(itemKey(item), { ...item });
        return {};
      }
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        const item = store.get(itemKey(key));
        return item ? { Item: { ...item } } : {};
      }
      if (command instanceof UpdateCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        const existing = store.get(itemKey(key));
        assert.ok(existing, 'update target must exist');
        applyUpdate(existing, command.input.UpdateExpression ?? '', command.input.ExpressionAttributeValues ?? {});
        store.set(itemKey(key), existing);
        return {};
      }
      if (command instanceof QueryCommand) {
        const indexName = command.input.IndexName;
        let items = [...store.values()];
        if (indexName === 'ByStatus') {
          const gsi2pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
          items = items.filter((item) => item.gsi2pk === gsi2pk && item.sk === metaSk());
        } else {
          const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
          items = items.filter((item) => item.pk === pk);
        }
        if (command.input.ScanIndexForward === false) {
          items.sort((a, b) => String(b.sk).localeCompare(String(a.sk)));
        }
        const limit = command.input.Limit ?? items.length;
        return { Items: items.slice(0, limit) };
      }
      if (command instanceof TransactWriteCommand) {
        applyTransact(store, command);
        return {};
      }
      throw new Error(`Unexpected command: ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  } as unknown as DynamoDBDocumentClient;
}

const mockS3 = {
  async send(command: unknown) {
    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key as string;
      if (s3Objects.has(key)) {
        return {};
      }
      throw new Error('NotFound');
    }
    if (command instanceof PutObjectCommand) {
      s3Objects.add(command.input.Key as string);
      return {};
    }
    throw new Error(`Unexpected S3 command: ${(command as { constructor: { name: string } }).constructor.name}`);
  },
} as unknown as S3Client;

async function seedTerminalBug(store: Store, client: DynamoDBDocumentClient, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const meta = {
    ...buildMetaItem('post-bug-1', USER_ID, 'Alice', {
      kind: 'bug',
      title: 'Broken board',
      body: 'Pieces overlap',
      status: 'resolved',
      legacyVoteCount: 0,
    }, now - 86_400_000 * 10),
    terminalAt: now - 86_400_000 * 10,
    gsi2pk: statusGsi2Pk('bug', 'resolved'),
    gsi2sk: String(now),
    ...overrides,
  };
  await seedFeedbackPostForTests(client, TABLE, meta);
  return meta;
}

test('1 terminal post before archive delay is not a candidate', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  await seedTerminalBug(store, client, { terminalAt: now - 86_400_000 });
  const ids = await findPostsReadyForArchive(client, TABLE, {
    archiveAfterTerminalDays: 7,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  assert.equal(ids.length, 0);
});

test('2 terminal post past delay has no archive fields until job runs', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const meta = await seedTerminalBug(store, client);
  const stored = store.get(itemKey({ pk: postPk(meta.id), sk: metaSk() }));
  assert.equal(stored?.archivedAt, undefined);
  assert.equal(stored?.expiresAt, undefined);
  assert.equal(store.has(itemKey({ pk: historyPk('bug'), sk: 'x' })), false);
});

test('3 archive job writes S3, HISTORY, archivedAt, and expiresAt', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  const meta = await seedTerminalBug(store, client);
  const config = { archiveAfterTerminalDays: 0, liveRetentionAfterArchiveDays: 90, now };
  const result = await archivePost(client, mockS3, TABLE, meta.id, config);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  const stored = store.get(itemKey({ pk: postPk(meta.id), sk: metaSk() }));
  assert.ok(stored?.archivedAt);
  assert.ok(stored?.expiresAt);
  assert.ok(s3Objects.has(result.s3ArchiveKey));
  const historyItems = [...store.values()].filter((item) => item.pk === historyPk('bug'));
  assert.equal(historyItems.length, 1);
});

test('4 archive is idempotent', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  const meta = await seedTerminalBug(store, client);
  const config = { archiveAfterTerminalDays: 0, liveRetentionAfterArchiveDays: 90, now };
  const first = await archivePost(client, mockS3, TABLE, meta.id, config);
  const second = await archivePost(client, mockS3, TABLE, meta.id, config);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (second.ok) {
    assert.equal(second.alreadyArchived, true);
  }
  const historyItems = [...store.values()].filter((item) => item.pk === historyPk('bug'));
  assert.equal(historyItems.length, 1);
});

test('5 archive failure when S3 put fails leaves no archivedAt', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  const meta = await seedTerminalBug(store, client);
  const failingS3 = {
    async send(command: unknown) {
      if (command instanceof HeadObjectCommand) {
        throw new Error('NotFound');
      }
      if (command instanceof PutObjectCommand) {
        throw new Error('S3 down');
      }
      throw new Error('unexpected');
    },
  } as unknown as S3Client;
  const result = await archivePost(client, failingS3, TABLE, meta.id, {
    archiveAfterTerminalDays: 0,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  assert.equal(result.ok, false);
  const stored = store.get(itemKey({ pk: postPk(meta.id), sk: metaSk() }));
  assert.equal(stored?.archivedAt, undefined);
});

test('6 feedback_get returns full thread with archived flag before TTL', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  const meta = await seedTerminalBug(store, client);
  await archivePost(client, mockS3, TABLE, meta.id, {
    archiveAfterTerminalDays: 0,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  const result = await feedbackGet(client, TABLE, mockS3, { id: meta.id });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.archived, true);
    assert.ok(result.data.post);
    assert.equal(result.data.purged, undefined);
  }
});

test('7 feedback_get returns history summary after live rows purged', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  const meta = await seedTerminalBug(store, client);
  await archivePost(client, mockS3, TABLE, meta.id, {
    archiveAfterTerminalDays: 0,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  for (const key of [...store.keys()].filter((k) => k.startsWith(postPk(meta.id)))) {
    store.delete(key);
  }
  const result = await feedbackGet(client, TABLE, mockS3, { id: meta.id });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.purged, true);
    assert.equal(result.data.summary?.title, 'Broken board');
    assert.equal(result.data.post, undefined);
  }
});

test('8 retentionHold skips archive', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  store.set(itemKey({ pk: 'USER', sk: ADMIN_ID }), { pk: 'USER', sk: ADMIN_ID, admin: true });
  process.env.ABSTRACT_PLAY_TABLE = TABLE;
  const now = Date.now();
  const meta = await seedTerminalBug(store, client, { retentionHold: true });
  const hold = await feedbackHoldRetention(client, TABLE, ADMIN_ID, { id: meta.id, hold: true });
  assert.equal(hold.ok, true);
  const result = await archivePost(client, mockS3, TABLE, meta.id, {
    archiveAfterTerminalDays: 0,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  assert.equal(result.ok, false);
});

test('9 feedback_history_list returns archived summaries by kind', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const now = Date.now();
  const meta = await seedTerminalBug(store, client);
  await archivePost(client, mockS3, TABLE, meta.id, {
    archiveAfterTerminalDays: 0,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  const list = await feedbackHistoryList(client, TABLE, { kind: 'bug', limit: 10 });
  assert.equal(list.ok, true);
  if (list.ok) {
    assert.equal(list.data.items.length, 1);
    assert.equal(list.data.items[0]?.title, 'Broken board');
  }
});

test('10 wishlist available history includes implementedGameMeta', async () => {
  const now = Date.now();
  const meta = {
    ...buildMetaItem('wish-1', USER_ID, 'Alice', {
      kind: 'wishlist',
      title: 'Hive',
      body: 'Classic',
      status: 'available',
      gameUrl: 'https://boardgamegeek.com/boardgame/2655',
      legacyVoteCount: 0,
    }, now),
    terminalAt: now,
    implementedGameMeta: { gameId: 'hive', name: 'Hive' },
    gsi2pk: statusGsi2Pk('wishlist', 'available'),
    gsi2sk: String(now),
  };
  const summary = buildHistorySummaryFromMeta(meta);
  assert.deepEqual(summary.implementedGameMeta, { gameId: 'hive', name: 'Hive' });
});
