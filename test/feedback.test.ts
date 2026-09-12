import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  feedbackAdminList,
  feedbackComment,
  feedbackCreate,
  feedbackDelete,
  feedbackGet,
  feedbackList,
  feedbackMine,
  feedbackReclassify,
  feedbackSetAdminFields,
  feedbackSetStatus,
  feedbackSubscribe,
  feedbackUpdate,
  feedbackVote,
  seedFeedbackPostForTests,
} from '../lib/feedback/access.js';
import { buildMetaItem } from '../lib/feedback/access.js';
import {
  listSkForSort,
  metaSk,
  postPk,
  subscribeSk,
  USER_PK_PREFIX,
  userIndexSk,
  voteSk,
} from '../lib/feedback/keys.js';
import {
  validateFeedbackCreatePars,
  validateFeedbackDeletePars,
  validateFeedbackReclassifyPars,
  validateFeedbackSetAdminFieldsPars,
} from '../lib/feedback/validate.js';
import { mapBugStatusToFeatureStatus } from '../lib/feedback/status.js';
import { notificationPk } from '../lib/notifications.js';

const TABLE = 'abstract-play-feedback-test';
process.env.FEEDBACK_ATTACHMENTS_BUCKET = 'ap-feedback-attachments-test';
const USER_ID = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const VOTER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ADMIN_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const REVIEWER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const mockS3 = {
  async send(command: unknown) {
    if (
      command instanceof HeadObjectCommand
      || command instanceof CopyObjectCommand
      || command instanceof DeleteObjectCommand
      || command instanceof ListObjectsV2Command
    ) {
      return {};
    }
    throw new Error(`Unexpected S3 command: ${(command as { constructor: { name: string } }).constructor.name}`);
  },
} as unknown as S3Client;

const presignS3 = new S3Client({ region: 'us-east-1' });

function itemKey(item: { pk: string; sk: string }) {
  return `${item.pk}:${item.sk}`;
}

type Store = Map<string, Record<string, unknown>>;

function resolveAttributeName(field: string, names?: Record<string, string>): string {
  if (field.startsWith('#') && names?.[field]) {
    return names[field];
  }
  return field;
}

function applyUpdateExpression(
  existing: Record<string, unknown>,
  updateExpression: string,
  values: Record<string, unknown>,
  names?: Record<string, string>,
) {
  const [setSection, removeSection] = updateExpression.split(/\s+REMOVE\s+/i);
  const setPart = setSection.replace(/^SET\s+/i, '');
  for (const assignment of setPart.split(',')) {
    const [field, placeholder] = assignment.trim().split(/\s*=\s*/);
    if (field && placeholder) {
      existing[resolveAttributeName(field, names)] = values[placeholder];
    }
  }
  if (removeSection) {
    for (const field of removeSection.split(',').map((part) => part.trim()).filter(Boolean)) {
      delete existing[field];
    }
  }
}

function applyTransact(store: Store, command: TransactWriteCommand) {
  for (const action of command.input.TransactItems ?? []) {
    if (action.Put) {
      const item = action.Put.Item as { pk: string; sk: string };
      store.set(itemKey(item), { ...item });
    } else if (action.Delete) {
      const key = action.Delete.Key as { pk: string; sk: string };
      store.delete(itemKey(key));
    } else if (action.Update) {
      const key = action.Update.Key as { pk: string; sk: string };
      const existing = store.get(itemKey(key));
      assert.ok(existing, 'update target must exist');
      applyUpdateExpression(
        existing,
        action.Update.UpdateExpression ?? '',
        action.Update.ExpressionAttributeValues as Record<string, unknown>,
        action.Update.ExpressionAttributeNames as Record<string, string> | undefined,
      );
      store.set(itemKey(key), existing);
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
      if (command instanceof DeleteCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        store.delete(itemKey(key));
        return {};
      }
      if (command instanceof UpdateCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        const existing = store.get(itemKey(key));
        assert.ok(existing, 'update target must exist');
        applyUpdateExpression(
          existing,
          command.input.UpdateExpression ?? '',
          command.input.ExpressionAttributeValues as Record<string, unknown>,
          command.input.ExpressionAttributeNames as Record<string, string> | undefined,
        );
        store.set(itemKey(key), existing);
        return {};
      }
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        const item = store.get(itemKey(key));
        return item ? { Item: { ...item } } : {};
      }
      if (command instanceof QueryCommand) {
        const pk = command.input.ExpressionAttributeValues?.[':pk'] as string | undefined;
        const gsi1pk = command.input.ExpressionAttributeValues?.[':pk'] as string | undefined;
        const skPrefix = command.input.ExpressionAttributeValues?.[':skPrefix'] as string | undefined;
        const beginsWithPrefix = command.input.ExpressionAttributeValues?.[':prefix'] as string | undefined;
        const gsiPrefix = beginsWithPrefix;
        const indexName = command.input.IndexName;
        let items = [...store.values()];
        if (indexName === 'ByKind') {
          items = items.filter((item) => item.gsi1pk === gsi1pk);
          if (gsiPrefix) {
            items = items.filter((item) => String(item.gsi1sk).startsWith(gsiPrefix));
          }
        } else if (indexName === 'ByStatus') {
          const gsi2pk = command.input.ExpressionAttributeValues?.[':pk'] as string | undefined;
          items = items.filter((item) => item.gsi2pk === gsi2pk);
        } else if (pk !== undefined) {
          items = items.filter((item) => item.pk === pk);
          const rowPrefix = skPrefix ?? beginsWithPrefix;
          if (rowPrefix !== undefined) {
            items = items.filter((item) => String(item.sk).startsWith(rowPrefix));
          }
        }
        if (command.input.ScanIndexForward === false) {
          items.sort((a, b) => String(b.gsi1sk ?? b.sk).localeCompare(String(a.gsi1sk ?? a.sk)));
        } else {
          items.sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
        }
        const startKey = command.input.ExclusiveStartKey as {
          pk?: string;
          sk?: string;
          gsi1pk?: string;
          gsi1sk?: string;
        } | undefined;
        if (startKey) {
          const startIndex = items.findIndex((item) => (
            (startKey.gsi1pk === undefined || item.gsi1pk === startKey.gsi1pk)
            && (startKey.gsi1sk === undefined || item.gsi1sk === startKey.gsi1sk)
            && (startKey.pk === undefined || item.pk === startKey.pk)
            && (startKey.sk === undefined || item.sk === startKey.sk)
          ));
          items = startIndex >= 0 ? items.slice(startIndex + 1) : items;
        }
        const limit = command.input.Limit ?? items.length;
        const rawPage = items.slice(0, limit);
        const filteredPage = command.input.FilterExpression?.includes('terminalAt')
          ? rawPage.filter((item) => item.terminalAt === undefined)
          : rawPage;
        const lastRaw = rawPage[rawPage.length - 1];
        const hasMore = items.length > limit;
        return {
          Items: filteredPage,
          ...(hasMore && lastRaw ? {
            LastEvaluatedKey: {
              pk: lastRaw.pk,
              sk: lastRaw.sk,
              gsi1pk: lastRaw.gsi1pk,
              gsi1sk: lastRaw.gsi1sk,
            },
          } : {}),
        };
      }
      if (command instanceof TransactWriteCommand) {
        applyTransact(store, command);
        return {};
      }
      throw new Error(`Unexpected command: ${(command as { constructor: { name: string } }).constructor.name}`);
    },
  };
}

test('validateFeedbackCreatePars accepts bug without attachments', () => {
  const result = validateFeedbackCreatePars(USER_ID, {
    kind: 'bug',
    title: 'Broken board',
    body: 'Pieces overlap',
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.attachmentKeys, undefined);
  }
});

test('feedbackCreate auto-votes for author on bug, feature, and wishlist', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const cases = [
    {
      kind: 'bug' as const,
      pars: { kind: 'bug' as const, title: 'Broken board', body: 'Pieces overlap.' },
    },
    {
      kind: 'feature' as const,
      pars: { kind: 'feature' as const, title: 'Dark mode', body: 'Please add dark mode.' },
    },
    {
      kind: 'wishlist' as const,
      pars: {
        kind: 'wishlist' as const,
        title: 'Azul',
        body: 'Please add this game.',
        gameUrl: 'https://boardgamegeek.com/boardgame/230802/azul',
      },
    },
  ];

  for (const { kind, pars } of cases) {
    const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, pars);
    assert.equal(createResult.ok, true);
    if (!createResult.ok) {
      return;
    }
    const id = createResult.data.id;
    const meta = store.get(`${postPk(id)}:${metaSk()}`);
    assert.equal(meta?.voteCount, 1, `${kind} voteCount`);
    assert.equal(meta?.effectiveVotes, 1, `${kind} effectiveVotes`);
    assert.ok(store.has(`${postPk(id)}:${voteSk(USER_ID)}`), `${kind} author vote row`);

    const getResult = await feedbackGet(client, TABLE, mockS3, { id }, USER_ID);
    assert.equal(getResult.ok, true);
    if (getResult.ok) {
      assert.ok(getResult.data.post, `${kind} post`);
      assert.equal(getResult.data.post!.effectiveVotes, 1, `${kind} get effectiveVotes`);
      assert.equal(getResult.data.userVoted, true, `${kind} userVoted`);
    }
  }
});

test('feedbackCreate rejects duplicate wishlist by bggGameId', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const gameUrl = 'https://boardgamegeek.com/boardgame/2655/hive';
  const first = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'wishlist',
    title: 'Hive',
    gameUrl,
  });
  assert.equal(first.ok, true);
  const second = await feedbackCreate(client, TABLE, mockS3, VOTER_ID, {
    kind: 'wishlist',
    title: 'Hive duplicate',
    gameUrl,
  });
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.code, 'duplicate');
    assert.ok(second.existingId);
  }
});

test('validateFeedbackCreatePars accepts wishlist with one cover image', () => {
  const stagingKey = `staging/${USER_ID}/cover.png`;
  const result = validateFeedbackCreatePars(USER_ID, {
    kind: 'wishlist',
    title: 'Hive',
    gameUrl: 'https://boardgamegeek.com/boardgame/2655/hive',
    attachmentKeys: [stagingKey],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data.attachmentKeys, [stagingKey]);
  }
});

test('validateFeedbackCreatePars rejects wishlist with more than one image', () => {
  const prefix = `staging/${USER_ID}/`;
  const result = validateFeedbackCreatePars(USER_ID, {
    kind: 'wishlist',
    title: 'Hive',
    gameUrl: 'https://boardgamegeek.com/boardgame/2655/hive',
    attachmentKeys: [`${prefix}a.png`, `${prefix}b.png`],
  });
  assert.equal(result.ok, false);
});

test('validateFeedbackCreatePars rejects feature with too many attachments', () => {
  const result = validateFeedbackCreatePars(USER_ID, {
    kind: 'feature',
    title: 'Mockups',
    body: 'See attached images.',
    attachmentKeys: ['a', 'b', 'c', 'd'],
  });
  assert.equal(result.ok, false);
});

test('feedbackCreate feature post and vote toggle updates counts', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Dark mode toggle',
    body: 'Please add a quick theme switch in settings.',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;

  const voteOn = await feedbackVote(client, TABLE, VOTER_ID, { id, vote: true });
  assert.equal(voteOn.ok, true);
  if (voteOn.ok) {
    assert.equal(voteOn.data.voteCount, 2);
    assert.equal(voteOn.data.effectiveVotes, 2);
    assert.equal(voteOn.data.voted, true);
  }
  for (const sort of ['votes', 'recent', 'updated'] as const) {
    const listItem = store.get(`${postPk(id)}:${listSkForSort(sort)}`);
    assert.equal(listItem?.effectiveVotes, 2, `feature LIST#${sort} effectiveVotes`);
  }
  const ideasList = await feedbackList(client, TABLE, { kind: 'feature', sort: 'votes' });
  assert.equal(ideasList.ok, true);
  if (ideasList.ok) {
    const item = ideasList.data.items.find((entry) => entry.id === id);
    assert.equal(item?.effectiveVotes, 2);
  }

  const voteAgain = await feedbackVote(client, TABLE, VOTER_ID, { id, vote: true });
  assert.equal(voteAgain.ok, true);
  if (voteAgain.ok) {
    assert.equal(voteAgain.data.voteCount, 2);
  }

  const voteOff = await feedbackVote(client, TABLE, VOTER_ID, { id, vote: false });
  assert.equal(voteOff.ok, true);
  if (voteOff.ok) {
    assert.equal(voteOff.data.voteCount, 1);
    assert.equal(voteOff.data.effectiveVotes, 1);
    assert.equal(voteOff.data.voted, false);
  }
});

test('effectiveVotes includes legacyVoteCount on seeded post', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const id = 'legacy-post-1';
  const now = Date.now();
  const meta = buildMetaItem(id, USER_ID, 'Tester', {
    kind: 'wishlist',
    title: 'Hive',
    status: 'requested',
    gameUrl: 'https://boardgamegeek.com/boardgame/2655/hive',
    bggGameId: '2655',
    legacyVoteCount: 42,
  }, now);
  await seedFeedbackPostForTests(client, TABLE, meta);

  const voteOn = await feedbackVote(client, TABLE, VOTER_ID, { id, vote: true });
  assert.equal(voteOn.ok, true);
  if (voteOn.ok) {
    assert.equal(voteOn.data.voteCount, 1);
    assert.equal(voteOn.data.effectiveVotes, 43);
  }
});

test('feedbackList excludes items with terminalAt set', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const openId = 'open-feature';
  const closedId = 'closed-feature';
  const now = Date.now();

  await seedFeedbackPostForTests(client, TABLE, buildMetaItem(openId, USER_ID, 'Tester', {
    kind: 'feature',
    title: 'Open idea',
    body: 'Still active',
    status: 'open',
    legacyVoteCount: 0,
  }, now));

  const closedMeta = buildMetaItem(closedId, USER_ID, 'Tester', {
    kind: 'feature',
    title: 'Shipped idea',
    body: 'Done',
    status: 'shipped',
    legacyVoteCount: 0,
  }, now - 1000);
  closedMeta.terminalAt = now;
  await seedFeedbackPostForTests(client, TABLE, closedMeta);

  const listResult = await feedbackList(client, TABLE, { kind: 'feature', sort: 'recent' });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    const ids = listResult.data.items.map((item) => item.id);
    assert.ok(ids.includes(openId));
    assert.ok(!ids.includes(closedId));
  }
});

test('feedbackList paginates past 100 when terminal rows are filtered from the index page', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const now = Date.now();
  const activeIds: string[] = [];

  for (let i = 0; i < 120; i += 1) {
    const id = `wishlist-page-${i}`;
    const legacyVoteCount = 120 - i;
    const meta = buildMetaItem(id, USER_ID, 'Tester', {
      kind: 'wishlist',
      title: `Game ${i}`,
      body: 'Please add',
      status: i === 0 ? 'available' : 'requested',
      legacyVoteCount,
    }, now - i);
    if (i === 0) {
      meta.terminalAt = now;
    } else {
      activeIds.push(id);
    }
    await seedFeedbackPostForTests(client, TABLE, meta);
  }

  const pageOne = await feedbackList(client, TABLE, { kind: 'wishlist', sort: 'votes', limit: 100 });
  assert.equal(pageOne.ok, true);
  if (!pageOne.ok) {
    return;
  }
  assert.equal(pageOne.data.items.length, 100);
  assert.ok(pageOne.data.nextCursor, 'expected nextCursor when more active items remain');

  const pageTwo = await feedbackList(client, TABLE, {
    kind: 'wishlist',
    sort: 'votes',
    limit: 100,
    cursor: pageOne.data.nextCursor,
  });
  assert.equal(pageTwo.ok, true);
  if (!pageTwo.ok) {
    return;
  }
  assert.equal(pageTwo.data.items.length, 19);
  assert.equal(pageTwo.data.nextCursor, undefined);

  const listedIds = [...pageOne.data.items, ...pageTwo.data.items].map((item) => item.id);
  assert.equal(listedIds.length, activeIds.length);
  for (const id of activeIds) {
    assert.ok(listedIds.includes(id));
  }
  assert.ok(!listedIds.includes('wishlist-page-0'));
});

test('feedbackComment increments commentCount and creates subscribe row by default', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Comment me',
    body: 'Needs discussion',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const commentResult = await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id,
    body: 'I like this idea.',
  });
  assert.equal(commentResult.ok, true);

  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.equal(meta?.commentCount, 1);
  const subKey = [...store.keys()].find((key) => key.includes('SUB#'));
  assert.ok(subKey);
});

test('feedbackSubscribe without comment creates SUB# row', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Watch me',
    body: 'Subscribe only',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const sub = await feedbackSubscribe(client, TABLE, VOTER_ID, { id, subscribe: true });
  assert.equal(sub.ok, true);
  assert.ok(store.has(`${postPk(id)}:SUB#${VOTER_ID}`));
});

test('feedbackComment updates commentCount on all list projections for bugs and features', async () => {
  for (const kind of ['bug', 'feature'] as const) {
    const store: Store = new Map();
    const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
    const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
      kind,
      title: `${kind} board count`,
      body: 'Comment count should appear on list',
    });
    assert.equal(createResult.ok, true);
    if (!createResult.ok) {
      return;
    }
    const id = createResult.data.id;
    const commentResult = await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
      id,
      body: 'Visible on the board',
      subscribe: false,
    });
    assert.equal(commentResult.ok, true);

    for (const sort of ['votes', 'recent', 'updated'] as const) {
      const listItem = store.get(`${postPk(id)}:${listSkForSort(sort)}`);
      assert.equal(listItem?.commentCount, 1, `${kind} LIST#${sort} commentCount`);
    }

    const sort = kind === 'feature' ? 'votes' : 'recent';
    const listResult = await feedbackList(client, TABLE, { kind, sort });
    assert.equal(listResult.ok, true);
    if (listResult.ok) {
      const item = listResult.data.items.find((entry) => entry.id === id);
      assert.equal(item?.commentCount, 1, `${kind} board list commentCount`);
    }
  }
});

test('feedbackVote updates voteCount on all list projections for bugs', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Vote sync',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const voteOn = await feedbackVote(client, TABLE, VOTER_ID, { id, vote: true });
  assert.equal(voteOn.ok, true);

  for (const sort of ['votes', 'recent', 'updated'] as const) {
    const listItem = store.get(`${postPk(id)}:${listSkForSort(sort)}`);
    assert.equal(listItem?.voteCount, 2, `bug LIST#${sort} voteCount`);
    assert.equal(listItem?.effectiveVotes, 2, `bug LIST#${sort} effectiveVotes`);
  }

  const bugsList = await feedbackList(client, TABLE, { kind: 'bug', sort: 'recent' });
  assert.equal(bugsList.ok, true);
  if (bugsList.ok) {
    const item = bugsList.data.items.find((entry) => entry.id === id);
    assert.equal(item?.effectiveVotes, 2);
  }
});

test('feedbackUpdate allows author to edit title', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Original title',
    body: 'Original body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const updateResult = await feedbackUpdate(client, TABLE, mockS3, USER_ID, {
    id,
    title: 'Updated title',
  }, false);
  assert.equal(updateResult.ok, true);

  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.equal(meta?.title, 'Updated title');
  const listItem = store.get(`${postPk(id)}:${listSkForSort('recent')}`);
  assert.equal(listItem?.title, 'Updated title');
});

test('feedbackUpdate allows wishlist author to add cover image', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'wishlist',
    title: 'Hive',
    gameUrl: 'https://boardgamegeek.com/boardgame/2655/hive',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const stagingKey = `staging/${USER_ID}/cover.png`;
  const updateResult = await feedbackUpdate(client, TABLE, mockS3, USER_ID, {
    id,
    attachmentKeys: [stagingKey],
  }, false);
  assert.equal(updateResult.ok, true);

  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.deepEqual(meta?.attachmentKeys, [`${id}/cover.png`]);
  const listItem = store.get(`${postPk(id)}:${listSkForSort('recent')}`);
  assert.deepEqual(listItem?.attachmentKeys, [`${id}/cover.png`]);
});

test('feedbackSetAdminFields sets effort on feature post', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Admin fields',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const adminResult = await feedbackSetAdminFields(client, TABLE, ADMIN_ID, {
    id,
    effort: 'high',
    priority: 'urgent',
  });
  assert.equal(adminResult.ok, true);
  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.equal(meta?.effort, 'high');
  assert.equal(meta?.priority, 'urgent');
});

test('mapBugStatusToFeatureStatus maps non-terminal bug statuses', () => {
  assert.equal(mapBugStatusToFeatureStatus('open'), 'open');
  assert.equal(mapBugStatusToFeatureStatus('triaged'), 'under_review');
  assert.equal(mapBugStatusToFeatureStatus('resolved'), null);
  assert.equal(mapBugStatusToFeatureStatus('closed'), null);
});

test('validateFeedbackReclassifyPars requires id', () => {
  const result = validateFeedbackReclassifyPars({});
  assert.equal(result.ok, false);
});

test('feedbackReclassify moves open bug to feature', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Not a bug',
    body: 'Feature request really',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const result = await feedbackReclassify(client, TABLE, ADMIN_ID, { id });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, 'feature');
    assert.equal(result.data.status, 'open');
  }
  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.equal(meta?.kind, 'feature');
  assert.equal(meta?.status, 'open');
  assert.equal(meta?.gsi2pk, 'STATUS#feature#open');
  const listItem = store.get(`${postPk(id)}:${listSkForSort('recent')}`);
  assert.equal(listItem?.kind, 'feature');
  assert.equal(listItem?.gsi1pk, 'KIND#feature');
  const userIndex = store.get(`${USER_PK_PREFIX}${USER_ID}:${userIndexSk('feature', meta!.createdAt as number, id)}`);
  assert.ok(userIndex);
  const listResult = await feedbackList(client, TABLE, { kind: 'feature' });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.ok(listResult.data.items.some((item) => item.id === id));
  }
});

test('feedbackReclassify rejects terminal bug', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Closed bug',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  await feedbackSetStatus(client, TABLE, ADMIN_ID, { id, status: 'closed' });
  const result = await feedbackReclassify(client, TABLE, ADMIN_ID, { id });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /terminal/i);
  }
});

test('feedbackReclassify rejects feature post', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Already a feature',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const result = await feedbackReclassify(client, TABLE, ADMIN_ID, { id: createResult.data.id });
  assert.equal(result.ok, false);
});

test('validateFeedbackSetAdminFieldsPars rejects reviewers on wishlist', () => {
  const result = validateFeedbackSetAdminFieldsPars({
    id: 'post-1',
    reviewerIds: [REVIEWER_ID],
  }, 'wishlist');
  assert.equal(result.ok, false);
});

test('feedbackSetAdminFields sets reviewers and notifies newly added', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  process.env.ABSTRACT_PLAY_TABLE = TABLE;
  store.set(itemKey({ pk: 'USER', sk: REVIEWER_ID }), {
    pk: 'USER',
    sk: REVIEWER_ID,
    name: 'Reviewer One',
  });
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Needs review',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const adminResult = await feedbackSetAdminFields(client, TABLE, ADMIN_ID, {
    id,
    reviewerIds: [REVIEWER_ID],
  });
  assert.equal(adminResult.ok, true);
  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.deepEqual(meta?.reviewers, [{ id: REVIEWER_ID, name: 'Reviewer One' }]);
  const getResult = await feedbackGet(client, TABLE, mockS3, { id });
  assert.equal(getResult.ok, true);
  if (getResult.ok) {
    assert.deepEqual(getResult.data.post?.reviewers, [{ id: REVIEWER_ID, name: 'Reviewer One' }]);
  }
  const notificationKey = [...store.keys()].find((key) => key.startsWith(`${notificationPk(REVIEWER_ID)}:`));
  assert.ok(notificationKey);
  const notification = store.get(notificationKey!);
  assert.equal((notification?.body as { type?: string })?.type, 'feedbackReviewRequested');
});

test('feedbackSetAdminFields sets priority with empty reviewerIds', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Priority with reviewers field',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const adminResult = await feedbackSetAdminFields(client, TABLE, ADMIN_ID, {
    id,
    priority: 'normal',
    reviewerIds: [],
  });
  assert.equal(adminResult.ok, true);
  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.equal(meta?.priority, 'normal');
  const listItem = store.get(`${postPk(id)}:${listSkForSort('recent')}`);
  assert.equal(listItem?.priority, 'normal');
});

test('feedbackSetAdminFields does not re-notify existing reviewers', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  process.env.ABSTRACT_PLAY_TABLE = TABLE;
  store.set(itemKey({ pk: 'USER', sk: REVIEWER_ID }), {
    pk: 'USER',
    sk: REVIEWER_ID,
    name: 'Reviewer One',
  });
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Feature review',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  await feedbackSetAdminFields(client, TABLE, ADMIN_ID, { id, reviewerIds: [REVIEWER_ID] });
  const countAfterFirst = [...store.keys()].filter((key) => key.startsWith(`${notificationPk(REVIEWER_ID)}:`)).length;
  assert.equal(countAfterFirst, 1);
  await feedbackSetAdminFields(client, TABLE, ADMIN_ID, {
    id,
    reviewerIds: [REVIEWER_ID],
    effort: 'low',
  });
  const countAfterSecond = [...store.keys()].filter((key) => key.startsWith(`${notificationPk(REVIEWER_ID)}:`)).length;
  assert.equal(countAfterSecond, 1);
});

test('validateFeedbackSetAdminFieldsPars rejects invalid priority', () => {
  const result = validateFeedbackSetAdminFieldsPars({
    id: 'post-1',
    priority: 'soon',
  }, 'feature');
  assert.equal(result.ok, false);
});

test('feedbackMine returns posts authored by user', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Mine me',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const mineResult = await feedbackMine(client, TABLE, USER_ID, { kind: 'feature' });
  assert.equal(mineResult.ok, true);
  if (mineResult.ok) {
    assert.ok(mineResult.data.items.some((item) => item.id === createResult.data.id));
  }
});

test('feedbackAdminList filters by priority', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Urgent bug',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  await feedbackSetAdminFields(client, TABLE, ADMIN_ID, { id, priority: 'urgent' });
  const listResult = await feedbackAdminList(client, TABLE, { kind: 'bug', priority: 'urgent' });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.ok(listResult.data.items.some((item) => item.id === id));
  }
});

test('feedbackAdminList filters by effort', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'High effort idea',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  await feedbackSetAdminFields(client, TABLE, ADMIN_ID, { id, effort: 'high' });
  const listResult = await feedbackAdminList(client, TABLE, { kind: 'feature', effort: 'high' });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.ok(listResult.data.items.some((item) => item.id === id));
  }
});

test('validateFeedbackDeletePars requires reason', () => {
  const missingReason = validateFeedbackDeletePars({ id: 'post-1' });
  assert.equal(missingReason.ok, false);
  const ok = validateFeedbackDeletePars({ id: 'post-1', reason: 'Duplicate of another entry.' });
  assert.equal(ok.ok, true);
});

test('feedbackDelete removes wishlist entry and rejects non-wishlist', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;

  const wishlistResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'wishlist',
    title: 'Azul',
    body: 'Please add this game.',
    gameUrl: 'https://boardgamegeek.com/boardgame/230802/azul',
  });
  assert.equal(wishlistResult.ok, true);
  if (!wishlistResult.ok) {
    return;
  }
  const wishlistId = wishlistResult.data.id;
  const metaBeforeDelete = store.get(`${postPk(wishlistId)}:${metaSk()}`);
  const createdAt = Number(metaBeforeDelete?.createdAt);
  await feedbackSubscribe(client, TABLE, VOTER_ID, { id: wishlistId, subscribe: true });
  await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id: wishlistId,
    body: 'I want this too.',
    subscribe: false,
  });

  const deleteResult = await feedbackDelete(client, TABLE, mockS3, ADMIN_ID, {
    id: wishlistId,
    reason: 'Duplicate of an existing wishlist entry.',
  });
  assert.equal(deleteResult.ok, true);
  assert.ok(!store.has(`${postPk(wishlistId)}:${metaSk()}`));
  assert.ok(!store.has(`${postPk(wishlistId)}:${listSkForSort('recent')}`));
  assert.ok(!store.has(`${postPk(wishlistId)}:${subscribeSk(VOTER_ID)}`));
  assert.ok(!store.has(`${USER_PK_PREFIX}${USER_ID}:${userIndexSk('wishlist', createdAt, wishlistId)}`));

  const getResult = await feedbackGet(client, TABLE, mockS3, { id: wishlistId });
  assert.equal(getResult.ok, false);
  if (!getResult.ok) {
    assert.equal(getResult.statusCode, 404);
  }

  const listResult = await feedbackList(client, TABLE, { kind: 'wishlist', sort: 'recent' });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.ok(!listResult.data.items.some((item) => item.id === wishlistId));
  }

  const featureResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'Dark mode',
    body: 'Please add dark mode.',
  });
  assert.equal(featureResult.ok, true);
  if (!featureResult.ok) {
    return;
  }
  const featureDelete = await feedbackDelete(client, TABLE, mockS3, ADMIN_ID, {
    id: featureResult.data.id,
    reason: 'Not applicable.',
  });
  assert.equal(featureDelete.ok, false);
  if (!featureDelete.ok) {
    assert.equal(featureDelete.statusCode, 400);
  }
});

test('feedbackComment stores attachments on bugs and features', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Screenshot follow-up',
    body: 'Broken layout',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const stagingKey = `staging/${VOTER_ID}/comment.png`;
  const commentResult = await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id,
    body: 'Here is what I see.',
    attachmentKeys: [stagingKey],
    subscribe: false,
  });
  assert.equal(commentResult.ok, true);
  if (!commentResult.ok) {
    return;
  }
  const commentKey = [...store.keys()].find((key) => key.includes('COMMENT#'));
  assert.ok(commentKey);
  const comment = store.get(commentKey!);
  assert.ok(Array.isArray(comment?.attachmentKeys));
  assert.match(String(comment?.attachmentKeys?.[0]), new RegExp(`^${id}/comments/`));

  const getResult = await feedbackGet(client, TABLE, presignS3, { id });
  assert.equal(getResult.ok, true);
  if (getResult.ok) {
    assert.equal(getResult.data.comments.length, 1);
    assert.equal(getResult.data.comments[0]?.attachmentUrls?.length, 1);
    assert.match(String(getResult.data.comments[0]?.attachmentUrls?.[0]?.key), new RegExp(`^${id}/comments/`));
  }
});

test('feedbackComment rejects attachments on wishlist', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'wishlist',
    title: 'Azul',
    gameUrl: 'https://boardgamegeek.com/boardgame/230802/azul',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const commentResult = await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id: createResult.data.id,
    body: 'Cover art',
    attachmentKeys: [`staging/${VOTER_ID}/cover.png`],
    subscribe: false,
  });
  assert.equal(commentResult.ok, false);
});

test('feedbackComment allows comments on terminal but not archived items', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Closed bug',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  const closeResult = await feedbackSetStatus(client, TABLE, ADMIN_ID, { id, status: 'closed' });
  assert.equal(closeResult.ok, true);
  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.ok(meta?.terminalAt);

  const commentResult = await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id,
    body: 'Follow-up after close',
    subscribe: false,
  });
  assert.equal(commentResult.ok, true);
  assert.equal(store.get(`${postPk(id)}:${metaSk()}`)?.commentCount, 1);

  store.set(`${postPk(id)}:${metaSk()}`, {
    ...store.get(`${postPk(id)}:${metaSk()}`)!,
    archivedAt: Date.now(),
  });
  const archivedComment = await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id,
    body: 'Too late',
    subscribe: false,
  });
  assert.equal(archivedComment.ok, false);
  if (!archivedComment.ok) {
    assert.match(archivedComment.message, /archived/i);
  }
});

test('feedbackSetStatus reopen removes terminalAt and restores board visibility', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'bug',
    title: 'Reopen me',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  await feedbackSetStatus(client, TABLE, ADMIN_ID, { id, status: 'closed' });
  assert.ok(store.get(`${postPk(id)}:${metaSk()}`)?.terminalAt);

  const reopenResult = await feedbackSetStatus(client, TABLE, ADMIN_ID, { id, status: 'open' });
  assert.equal(reopenResult.ok, true);
  const meta = store.get(`${postPk(id)}:${metaSk()}`);
  assert.equal(meta?.status, 'open');
  assert.equal(meta?.terminalAt, undefined);

  const listResult = await feedbackList(client, TABLE, { kind: 'bug', sort: 'recent' });
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.ok(listResult.data.items.some((item) => item.id === id));
  }

  const voteResult = await feedbackVote(client, TABLE, VOTER_ID, { id, vote: true });
  assert.equal(voteResult.ok, true);
});

test('feedbackComment with subscribe false does not add SUB# for commenter', async () => {
  const store: Store = new Map();
  const client = createMockDocClient(store) as unknown as DynamoDBDocumentClient;
  const createResult = await feedbackCreate(client, TABLE, mockS3, USER_ID, {
    kind: 'feature',
    title: 'No sub',
    body: 'Body',
  });
  assert.equal(createResult.ok, true);
  if (!createResult.ok) {
    return;
  }
  const id = createResult.data.id;
  await feedbackComment(client, TABLE, mockS3, VOTER_ID, {
    id,
    body: 'Just commenting',
    subscribe: false,
  });
  assert.ok(!store.has(`${postPk(id)}:SUB#${VOTER_ID}`));
});
