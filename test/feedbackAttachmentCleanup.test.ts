import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  collectAttachmentKeysFromArchiveSnapshot,
  purgeStaleStagingObjects,
  runFeedbackAttachmentCleanupJob,
} from '../lib/feedback/attachmentCleanup.js';
import { archivePost } from '../lib/feedback/archive.js';
import { feedbackDelete } from '../lib/feedback/access.js';
import { buildMetaItem } from '../lib/feedback/access.js';
import {
  finalizeAttachmentKeys,
} from '../lib/feedback/attachments.js';
import {
  HISTORY_LOOKUP_SK,
  historyPk,
  historySk,
  metaSk,
  postIdLookupPk,
  postPk,
} from '../lib/feedback/keys.js';

const TABLE = 'abstract-play-feedback-attachment-cleanup-test';
const ADMIN_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';

process.env.FEEDBACK_ATTACHMENTS_BUCKET = 'ap-feedback-attachments-test';
process.env.ABSTRACT_PLAY_TABLE = TABLE;

type Store = Map<string, Record<string, unknown>>;
type S3Object = { body?: string; lastModified: number };

const s3Objects = new Map<string, S3Object>();

function itemKey(item: { pk: string; sk: string }) {
  return `${item.pk}:${item.sk}`;
}

function applyUpdate(existing: Record<string, unknown>, updateExpression: string, values: Record<string, unknown>) {
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
      if (command instanceof DeleteCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        store.delete(itemKey(key));
        return {};
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
        const items = [...store.values()].filter((item) => item.pk === pk);
        if (command.input.ScanIndexForward === false) {
          items.sort((a, b) => String(b.sk).localeCompare(String(a.sk)));
        }
        return { Items: items };
      }
      throw new Error(`Unexpected command: ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  } as unknown as DynamoDBDocumentClient;
}

function createMockS3(now = Date.now()) {
  return {
    async send(command: unknown) {
      if (command instanceof HeadObjectCommand) {
        const key = command.input.Key!;
        if (!s3Objects.has(key)) {
          throw new Error('not found');
        }
        return {};
      }
      if (command instanceof CopyObjectCommand) {
        const sourceKey = command.input.CopySource!.split('/').slice(1).join('/');
        const targetKey = command.input.Key!;
        const source = s3Objects.get(sourceKey);
        assert.ok(source, `missing copy source ${sourceKey}`);
        s3Objects.set(targetKey, { ...source });
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        s3Objects.delete(command.input.Key!);
        return {};
      }
      if (command instanceof ListObjectsV2Command) {
        const prefix = command.input.Prefix ?? '';
        const contents = [...s3Objects.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({ Key: key, LastModified: new Date(value.lastModified) }));
        return { Contents: contents };
      }
      if (command instanceof GetObjectCommand) {
        const key = command.input.Key!;
        const value = s3Objects.get(key);
        assert.ok(value, `missing object ${key}`);
        return {
          Body: {
            async transformToString() {
              return value.body ?? '';
            },
          },
        };
      }
      if (command instanceof PutObjectCommand) {
        s3Objects.set(command.input.Key!, { body: command.input.Body as string, lastModified: now });
        return {};
      }
      throw new Error(`Unexpected S3 command: ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  } as unknown as S3Client;
}

function seedHistoryRow(
  store: Store,
  {
    id,
    kind = 'bug',
    attachmentKeys = ['post-1/screenshot.png'],
    attachmentsPurgeAfter,
    attachmentsPurgedAt,
    closedAt = Date.now(),
  }: {
    id: string;
    kind?: 'bug' | 'feature' | 'wishlist';
    attachmentKeys?: string[];
    attachmentsPurgeAfter?: number;
    attachmentsPurgedAt?: number;
    closedAt?: number;
  },
) {
  const historyItem = {
    pk: historyPk(kind),
    sk: historySk(closedAt, id),
    entityType: 'history',
    id,
    kind,
    title: 'Broken board',
    terminalStatus: 'resolved',
    closedAt,
    authorName: 'Alice',
    effectiveVotes: 1,
    attachmentKeys,
    attachmentsPurgeAfter,
    attachmentsPurgedAt,
    s3ArchiveKey: `archive/${id}.json`,
  };
  store.set(itemKey(historyItem), historyItem);
  const { pk: _pk, sk: _sk, entityType: _entityType, ...historyFields } = historyItem;
  const lookupItem = {
    pk: postIdLookupPk(id),
    sk: HISTORY_LOOKUP_SK,
    entityType: 'historyLookup',
    ...historyFields,
  };
  store.set(itemKey(lookupItem), lookupItem);
}

test('finalizeAttachmentKeys deletes staging source after copy', async () => {
  s3Objects.clear();
  const now = Date.now();
  const s3 = createMockS3(now);
  const stagingKey = 'staging/user-1/abc.png';
  s3Objects.set(stagingKey, { lastModified: now });

  const finalKeys = await finalizeAttachmentKeys(s3, 'user-1', 'post-1', [stagingKey]);
  assert.deepEqual(finalKeys, ['post-1/abc.png']);
  assert.ok(s3Objects.has('post-1/abc.png'));
  assert.ok(!s3Objects.has(stagingKey));
});

test('feedbackDelete deletes post attachment prefix objects', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const id = 'wish-1';
  const meta = buildMetaItem(id, USER_ID, 'Alice', {
    kind: 'wishlist',
    title: 'Hive',
    body: 'Please add',
    status: 'requested',
    gameUrl: 'https://boardgamegeek.com/boardgame/2655',
    attachmentKeys: [`${id}/shot.png`],
    legacyVoteCount: 0,
  }, Date.now());
  store.set(itemKey(meta), meta);
  s3Objects.set(`${id}/shot.png`, { lastModified: Date.now() });

  const result = await feedbackDelete(client, TABLE, s3, ADMIN_ID, {
    id,
    reason: 'Duplicate entry.',
  });
  assert.equal(result.ok, true);
  assert.ok(!s3Objects.has(`${id}/shot.png`));
});

test('job skips history row when attachmentsPurgeAfter is in the future', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const now = Date.now();
  seedHistoryRow(store, {
    id: 'post-future',
    attachmentsPurgeAfter: now + 86_400_000,
  });
  s3Objects.set('post-future/screenshot.png', { lastModified: now });

  const summary = await runFeedbackAttachmentCleanupJob(client, s3, TABLE, { now });
  assert.equal(summary.archivedSkipped, 1);
  assert.equal(summary.archivedPurged, 0);
  assert.ok(s3Objects.has('post-future/screenshot.png'));
});

test('job skips when live META still exists with future expiresAt', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const now = Date.now();
  const id = 'post-live';
  seedHistoryRow(store, {
    id,
    attachmentsPurgeAfter: now - 1,
  });
  const meta = buildMetaItem(id, USER_ID, 'Alice', {
    kind: 'bug',
    title: 'Still live',
    body: 'Details',
    status: 'resolved',
    legacyVoteCount: 0,
  }, now);
  meta.expiresAt = now + 86_400_000;
  store.set(itemKey(meta), meta);
  s3Objects.set(`${id}/screenshot.png`, { lastModified: now });

  const summary = await runFeedbackAttachmentCleanupJob(client, s3, TABLE, { now });
  assert.equal(summary.archivedSkipped, 1);
  assert.ok(s3Objects.has(`${id}/screenshot.png`));
});

test('job deletes keys from history row when META is gone and sets attachmentsPurgedAt', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const now = Date.now();
  const id = 'post-purge';
  seedHistoryRow(store, {
    id,
    attachmentsPurgeAfter: now - 1,
    attachmentKeys: [`${id}/screenshot.png`],
  });
  s3Objects.set(`${id}/screenshot.png`, { lastModified: now });

  const summary = await runFeedbackAttachmentCleanupJob(client, s3, TABLE, { now });
  assert.equal(summary.archivedPurged, 1);
  assert.ok(!s3Objects.has(`${id}/screenshot.png`));
  const history = [...store.values()].find((item) => item.id === id && item.entityType === 'history');
  const lookup = store.get(`${postIdLookupPk(id)}:${HISTORY_LOOKUP_SK}`);
  assert.ok(history?.attachmentsPurgedAt);
  assert.ok(lookup?.attachmentsPurgedAt);
});

test('job falls back to archive JSON when history row lacks attachmentKeys', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const now = Date.now();
  const id = 'post-archive-fallback';
  seedHistoryRow(store, {
    id,
    attachmentsPurgeAfter: now - 1,
    attachmentKeys: [],
  });
  s3Objects.set(`${id}/from-archive.png`, { lastModified: now });
  s3Objects.set(`archive/${id}.json`, {
    lastModified: now,
    body: JSON.stringify({
      archivedAt: now,
      postId: id,
      meta: { attachmentKeys: [`${id}/from-archive.png`] },
      children: [],
      userIndexRows: [],
    }),
  });

  const keys = collectAttachmentKeysFromArchiveSnapshot(JSON.parse(
    s3Objects.get(`archive/${id}.json`)!.body!,
  ));
  assert.deepEqual(keys, [`${id}/from-archive.png`]);

  const summary = await runFeedbackAttachmentCleanupJob(client, s3, TABLE, { now });
  assert.equal(summary.archivedPurged, 1);
  assert.ok(!s3Objects.has(`${id}/from-archive.png`));
  assert.ok(s3Objects.has(`archive/${id}.json`));
});

test('job is idempotent on second run', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const now = Date.now();
  const id = 'post-idempotent';
  seedHistoryRow(store, {
    id,
    attachmentsPurgeAfter: now - 1,
    attachmentKeys: [`${id}/screenshot.png`],
  });
  s3Objects.set(`${id}/screenshot.png`, { lastModified: now });

  const first = await runFeedbackAttachmentCleanupJob(client, s3, TABLE, { now });
  const second = await runFeedbackAttachmentCleanupJob(client, s3, TABLE, { now });
  assert.equal(first.archivedPurged, 1);
  assert.equal(second.archivedPurged, 0);
  assert.equal(second.archivedSkipped, 1);
});

test('staging sweeper deletes only objects older than threshold', async () => {
  s3Objects.clear();
  const now = Date.now();
  const s3 = createMockS3(now);
  s3Objects.set('staging/user/old.png', { lastModified: now - (25 * 3_600_000) });
  s3Objects.set('staging/user/new.png', { lastModified: now - (1 * 3_600_000) });

  const result = await purgeStaleStagingObjects(s3, { now, stagingMaxAgeHours: 24 });
  assert.equal(result.deleted, 1);
  assert.ok(!s3Objects.has('staging/user/old.png'));
  assert.ok(s3Objects.has('staging/user/new.png'));
});

test('archivePost stamps attachment purge metadata on history rows', async () => {
  s3Objects.clear();
  const store: Store = new Map();
  const client = createMockDocClient(store);
  const s3 = createMockS3();
  const now = Date.now();
  const id = 'post-archive-meta';
  const meta = buildMetaItem(id, USER_ID, 'Alice', {
    kind: 'bug',
    title: 'Crash',
    body: 'Details',
    status: 'resolved',
    attachmentKeys: [`${id}/shot.png`],
    legacyVoteCount: 0,
  }, now);
  meta.terminalAt = now;
  store.set(itemKey(meta), meta);

  const result = await archivePost(client, s3, TABLE, id, {
    archiveAfterTerminalDays: 0,
    liveRetentionAfterArchiveDays: 90,
    now,
  });
  assert.equal(result.ok, true);
  const history = [...store.values()].find((item) => item.pk === historyPk('bug'));
  assert.ok(history);
  assert.deepEqual(history.attachmentKeys, [`${id}/shot.png`]);
  assert.equal(history.attachmentsPurgeAfter, now + 90 * 86_400_000);
});
