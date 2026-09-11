import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type {
  FeedbackGetResult,
  FeedbackListSort,
  FeedbackMetaItem,
  FeedbackPresignUploadPars,
  FeedbackPublicComment,
  FeedbackPublicPost,
  FeedbackSetStatusPars,
  FeedbackSubscribePars,
} from './types.js';
import { generateCommentId, generatePostId } from './ids.js';
import {
  commentSk,
  kindGsi1Pk,
  listGsi1SkForSort,
  listSkForSort,
  listSortPrefix,
  metaSk,
  postPk,
  statusGsi2Pk,
  subscribeSk,
  userIndexSk,
  voteSk,
  USER_PK_PREFIX,
} from './keys.js';
import {
  assertStagingObjectsExist,
  finalizeAttachmentKeys,
  presignAttachmentGetUrls,
  presignAttachmentPutUrl,
} from './attachments.js';
import { notifyFeedbackComment, notifyFeedbackStatusChange } from './notifications.js';
import { isUserSubscribed } from './subscribe.js';
import { isTerminalStatus } from './status.js';
import {
  validateFeedbackCommentPars,
  validateFeedbackCreatePars,
  validateFeedbackGetPars,
  validateFeedbackListPars,
  validateFeedbackPresignUploadPars,
  validateFeedbackSetStatusPars,
  validateFeedbackSubscribePars,
  validateFeedbackVotePars,
  type ValidatedFeedbackCreate,
} from './validate.js';
import type {
  FeedbackCommentPars,
  FeedbackCreatePars,
  FeedbackGetPars,
  FeedbackListPars,
  FeedbackResult,
  FeedbackVotePars,
} from './types.js';

const MAIN_TABLE = process.env.ABSTRACT_PLAY_TABLE;

function getFeedbackTableName(tableName?: string): string {
  const resolved = tableName ?? process.env.FEEDBACK_TABLE;
  if (!resolved) {
    throw new Error('FEEDBACK_TABLE is not configured');
  }
  return resolved;
}

async function loadIsAdmin(
  client: DynamoDBDocumentClient,
  userId: string,
): Promise<boolean> {
  if (!MAIN_TABLE) {
    return false;
  }
  const result = await client.send(new GetCommand({
    TableName: MAIN_TABLE,
    Key: { pk: 'USER', sk: userId },
  }));
  return result.Item?.admin === true;
}

async function loadAuthorName(
  client: DynamoDBDocumentClient,
  userId: string,
): Promise<string> {
  if (!MAIN_TABLE) {
    return 'Unknown';
  }
  const result = await client.send(new GetCommand({
    TableName: MAIN_TABLE,
    Key: { pk: 'USER', sk: userId },
  }));
  const name = result.Item?.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : 'Unknown';
}

function buildListFields(
  meta: Pick<
    FeedbackMetaItem,
    'id' | 'kind' | 'title' | 'status' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt'
    | 'voteCount' | 'legacyVoteCount' | 'effectiveVotes' | 'commentCount' | 'attachmentKeys' | 'terminalAt'
  >,
) {
  return {
    id: meta.id,
    kind: meta.kind,
    title: meta.title,
    status: meta.status,
    authorId: meta.authorId,
    authorName: meta.authorName,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    voteCount: meta.voteCount,
    legacyVoteCount: meta.legacyVoteCount,
    effectiveVotes: meta.effectiveVotes,
    commentCount: meta.commentCount,
    attachmentKeys: meta.attachmentKeys,
    terminalAt: meta.terminalAt,
  };
}

function buildMetaItem(
  id: string,
  authorId: string,
  authorName: string,
  data: ValidatedFeedbackCreate,
  now: number,
): FeedbackMetaItem {
  const effectiveVotes = data.legacyVoteCount;
  return {
    pk: postPk(id),
    sk: metaSk(),
    entityType: 'meta',
    id,
    kind: data.kind,
    title: data.title,
    body: data.body,
    status: data.status as FeedbackMetaItem['status'],
    authorId,
    authorName,
    createdAt: now,
    updatedAt: now,
    voteCount: 0,
    legacyVoteCount: data.legacyVoteCount,
    effectiveVotes,
    commentCount: 0,
    attachmentKeys: data.attachmentKeys,
    context: data.context,
    gameUrl: data.gameUrl,
    bggGameId: data.bggGameId,
    gsi2pk: statusGsi2Pk(data.kind, data.status),
    gsi2sk: String(now),
  };
}

function buildListIndexItem(
  meta: FeedbackMetaItem,
  sort: FeedbackListSort,
): Record<string, unknown> {
  return {
    ...buildListFields(meta),
    pk: meta.pk,
    sk: listSkForSort(sort),
    entityType: 'list',
    gsi1pk: kindGsi1Pk(meta.kind),
    gsi1sk: listGsi1SkForSort(sort, meta.effectiveVotes, meta.createdAt, meta.updatedAt, meta.id),
  };
}

function toPublicPost(item: Record<string, unknown>): FeedbackPublicPost {
  return {
    id: String(item.id),
    kind: item.kind as FeedbackPublicPost['kind'],
    title: String(item.title),
    body: typeof item.body === 'string' ? item.body : undefined,
    status: item.status as FeedbackPublicPost['status'],
    authorId: String(item.authorId),
    authorName: String(item.authorName),
    createdAt: Number(item.createdAt),
    updatedAt: Number(item.updatedAt),
    voteCount: Number(item.voteCount ?? 0),
    legacyVoteCount: Number(item.legacyVoteCount ?? 0),
    effectiveVotes: Number(item.effectiveVotes ?? 0),
    commentCount: Number(item.commentCount ?? 0),
    attachmentKeys: Array.isArray(item.attachmentKeys) ? item.attachmentKeys as string[] : undefined,
    gameUrl: typeof item.gameUrl === 'string' ? item.gameUrl : undefined,
    bggGameId: typeof item.bggGameId === 'string' ? item.bggGameId : undefined,
    wishlistCategory: item.wishlistCategory as FeedbackPublicPost['wishlistCategory'],
  };
}

function toPublicComment(item: Record<string, unknown>): FeedbackPublicComment {
  return {
    commentId: String(item.commentId),
    authorId: String(item.authorId),
    authorName: String(item.authorName),
    body: String(item.body),
    createdAt: Number(item.createdAt),
    isStaff: item.isStaff === true,
  };
}

export async function feedbackCreate(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  s3: S3Client,
  userId: string,
  pars: FeedbackCreatePars,
): Promise<FeedbackResult<{ id: string }>> {
  const validated = validateFeedbackCreatePars(userId, pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const data = validated.data;
  const id = generatePostId();
  const now = Date.now();
  const authorName = await loadAuthorName(client, userId);

  let attachmentKeys = data.attachmentKeys;
  if (attachmentKeys && attachmentKeys.length > 0) {
    const exists = await assertStagingObjectsExist(s3, attachmentKeys);
    if (!exists.ok) {
      return { ok: false, message: exists.message, statusCode: 400 };
    }
    attachmentKeys = await finalizeAttachmentKeys(s3, userId, id, attachmentKeys);
  }

  const meta = buildMetaItem(id, userId, authorName, { ...data, attachmentKeys }, now);

  const writes = [
    { Put: { TableName: feedbackTable, Item: meta } },
    { Put: { TableName: feedbackTable, Item: buildListIndexItem(meta, 'votes') } },
    { Put: { TableName: feedbackTable, Item: buildListIndexItem(meta, 'recent') } },
    { Put: { TableName: feedbackTable, Item: buildListIndexItem(meta, 'updated') } },
    {
      Put: {
        TableName: feedbackTable,
        Item: {
          pk: `${USER_PK_PREFIX}${userId}`,
          sk: userIndexSk(data.kind, now, id),
          entityType: 'userIndex',
          id,
          kind: data.kind,
          createdAt: now,
        },
      },
    },
    {
      Put: {
        TableName: feedbackTable,
        Item: {
          pk: postPk(id),
          sk: subscribeSk(userId),
          entityType: 'subscribe',
          userId,
          createdAt: now,
          source: 'comment',
        },
      },
    },
  ];

  await client.send(new TransactWriteCommand({ TransactItems: writes }));
  return { ok: true, data: { id } };
}

export async function feedbackList(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  pars: FeedbackListPars,
): Promise<FeedbackResult<{ items: FeedbackPublicPost[]; nextCursor?: string }>> {
  const validated = validateFeedbackListPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { kind, sort, limit, cursor } = validated.data;
  const prefix = listSortPrefix(sort);

  const result = await client.send(new QueryCommand({
    TableName: feedbackTable,
    IndexName: 'ByKind',
    KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': kindGsi1Pk(kind),
      ':prefix': prefix,
    },
    FilterExpression: 'attribute_not_exists(terminalAt)',
    ScanIndexForward: false,
    Limit: limit + 1,
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
  }));

  const rawItems = (result.Items ?? []).slice(0, limit);
  const items = rawItems.map((item) => toPublicPost(item));
  let nextCursor: string | undefined;
  if ((result.Items ?? []).length > limit && rawItems.length > 0) {
    const last = rawItems[rawItems.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({
      gsi1pk: last.gsi1pk,
      gsi1sk: last.gsi1sk,
      pk: last.pk,
      sk: last.sk,
    })).toString('base64url');
  }

  return { ok: true, data: { items, nextCursor } };
}

export async function feedbackGet(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  s3: S3Client,
  pars: FeedbackGetPars,
  viewerUserId?: string,
): Promise<FeedbackResult<FeedbackGetResult>> {
  const validated = validateFeedbackGetPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id } = validated.data;

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk: postPk(id), sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }

  const commentsResult = await client.send(new QueryCommand({
    TableName: feedbackTable,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': postPk(id),
      ':skPrefix': 'COMMENT#',
    },
    ScanIndexForward: true,
  }));

  const post = toPublicPost(metaResult.Item);
  const comments = (commentsResult.Items ?? []).map((item) => toPublicComment(item));
  const attachmentUrls = await presignAttachmentGetUrls(
    s3,
    Array.isArray(metaResult.Item.attachmentKeys) ? metaResult.Item.attachmentKeys as string[] : [],
  );

  let subscribed: boolean | undefined;
  let userVoted: boolean | undefined;
  if (viewerUserId) {
    subscribed = await isUserSubscribed(client, feedbackTable, id, viewerUserId);
    const voteResult = await client.send(new GetCommand({
      TableName: feedbackTable,
      Key: { pk: postPk(id), sk: voteSk(viewerUserId) },
    }));
    userVoted = Boolean(voteResult.Item);
  }

  return { ok: true, data: { post, comments, attachmentUrls, subscribed, userVoted } };
}

export async function feedbackPresignUpload(
  s3: S3Client,
  userId: string,
  pars: FeedbackPresignUploadPars,
): Promise<FeedbackResult<{ uploadUrl: string; key: string; headers: Record<string, string> }>> {
  const validated = validateFeedbackPresignUploadPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }
  const result = await presignAttachmentPutUrl(s3, userId, validated.data.contentType);
  return { ok: true, data: result };
}

export async function feedbackVote(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  userId: string,
  pars: FeedbackVotePars,
): Promise<FeedbackResult<{ voteCount: number; effectiveVotes: number; voted: boolean }>> {
  const validated = validateFeedbackVotePars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id, vote } = validated.data;
  const pk = postPk(id);

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }
  if (metaResult.Item.terminalAt !== undefined) {
    return { ok: false, message: 'cannot vote on a closed item.', statusCode: 400 };
  }

  const voteKey = { pk, sk: voteSk(userId) };
  const existingVote = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: voteKey,
  }));
  const hasVote = Boolean(existingVote.Item);
  const now = Date.now();

  if (vote && hasVote) {
    const voteCount = Number(metaResult.Item.voteCount ?? 0);
    const legacyVoteCount = Number(metaResult.Item.legacyVoteCount ?? 0);
    return {
      ok: true,
      data: {
        voteCount,
        effectiveVotes: voteCount + legacyVoteCount,
        voted: true,
      },
    };
  }
  if (!vote && !hasVote) {
    const voteCount = Number(metaResult.Item.voteCount ?? 0);
    const legacyVoteCount = Number(metaResult.Item.legacyVoteCount ?? 0);
    return {
      ok: true,
      data: {
        voteCount,
        effectiveVotes: voteCount + legacyVoteCount,
        voted: false,
      },
    };
  }

  const currentVoteCount = Number(metaResult.Item.voteCount ?? 0);
  const legacyVoteCount = Number(metaResult.Item.legacyVoteCount ?? 0);
  const nextVoteCount = vote ? currentVoteCount + 1 : Math.max(0, currentVoteCount - 1);
  const effectiveVotes = nextVoteCount + legacyVoteCount;
  const createdAt = Number(metaResult.Item.createdAt);

  const transactItems: Record<string, unknown>[] = vote
    ? [
      {
        Put: {
          TableName: feedbackTable,
          Item: {
            ...voteKey,
            entityType: 'vote',
            userId,
            createdAt: now,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ]
    : [
      {
        Delete: {
          TableName: feedbackTable,
          Key: voteKey,
          ConditionExpression: 'attribute_exists(pk)',
        },
      },
    ];

  transactItems.push({
    Update: {
      TableName: feedbackTable,
      Key: { pk, sk: metaSk() },
      UpdateExpression: 'SET voteCount = :vc, effectiveVotes = :ev, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':vc': nextVoteCount,
        ':ev': effectiveVotes,
        ':ua': now,
      },
    },
  });

  transactItems.push({
    Update: {
      TableName: feedbackTable,
      Key: { pk, sk: listSkForSort('votes') },
      UpdateExpression: 'SET voteCount = :vc, effectiveVotes = :ev, gsi1sk = :gsi1sk, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':vc': nextVoteCount,
        ':ev': effectiveVotes,
        ':gsi1sk': listGsi1SkForSort('votes', effectiveVotes, createdAt, now, id),
        ':ua': now,
      },
    },
  });

  transactItems.push({
    Update: {
      TableName: feedbackTable,
      Key: { pk, sk: listSkForSort('updated') },
      UpdateExpression: 'SET voteCount = :vc, effectiveVotes = :ev, gsi1sk = :gsi1sk, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':vc': nextVoteCount,
        ':ev': effectiveVotes,
        ':gsi1sk': listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id),
        ':ua': now,
      },
    },
  });

  try {
    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (error) {
    const err = error as { name?: string };
    if (err.name === 'TransactionCanceledException') {
      return { ok: false, message: 'vote could not be applied.', statusCode: 409 };
    }
    throw error;
  }

  return {
    ok: true,
    data: {
      voteCount: nextVoteCount,
      effectiveVotes,
      voted: vote,
    },
  };
}

export async function feedbackComment(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  userId: string,
  pars: FeedbackCommentPars,
): Promise<FeedbackResult<{ commentId: string }>> {
  const validated = validateFeedbackCommentPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id, body, subscribe } = validated.data;
  const pk = postPk(id);

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }
  if (metaResult.Item.terminalAt !== undefined) {
    return { ok: false, message: 'cannot comment on a closed item.', statusCode: 400 };
  }

  const now = Date.now();
  const commentId = generateCommentId();
  const authorName = await loadAuthorName(client, userId);
  const isStaff = await loadIsAdmin(client, userId);
  const createdAt = Number(metaResult.Item.createdAt);
  const effectiveVotes = Number(metaResult.Item.effectiveVotes ?? 0);
  const commentCount = Number(metaResult.Item.commentCount ?? 0) + 1;

  const transactItems: Record<string, unknown>[] = [
    {
      Put: {
        TableName: feedbackTable,
        Item: {
          pk,
          sk: commentSk(now, commentId),
          entityType: 'comment',
          commentId,
          authorId: userId,
          authorName,
          body,
          createdAt: now,
          ...(isStaff ? { isStaff: true } : {}),
        },
      },
    },
    {
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: metaSk() },
        UpdateExpression: 'SET commentCount = :cc, updatedAt = :ua',
        ExpressionAttributeValues: {
          ':cc': commentCount,
          ':ua': now,
        },
      },
    },
    {
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort('updated') },
        UpdateExpression: 'SET commentCount = :cc, updatedAt = :ua, gsi1sk = :gsi1sk',
        ExpressionAttributeValues: {
          ':cc': commentCount,
          ':ua': now,
          ':gsi1sk': listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id),
        },
      },
    },
  ];

  if (subscribe) {
    transactItems.push({
      Put: {
        TableName: feedbackTable,
        Item: {
          pk,
          sk: subscribeSk(userId),
          entityType: 'subscribe',
          userId,
          createdAt: now,
          source: 'comment',
        },
      },
    });
  }

  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

  const kind = metaResult.Item.kind as FeedbackMetaItem['kind'];
  const title = String(metaResult.Item.title);
  const authorId = String(metaResult.Item.authorId);
  try {
    await notifyFeedbackComment(client, feedbackTable, {
      postId: id,
      kind,
      title,
      authorId,
      commenterId: userId,
      commentPreview: body,
    });
  } catch (error) {
    console.error('notifyFeedbackComment failed', error);
  }

  return { ok: true, data: { commentId } };
}

export async function feedbackSubscribe(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  userId: string,
  pars: FeedbackSubscribePars,
): Promise<FeedbackResult<{ subscribed: boolean }>> {
  const validated = validateFeedbackSubscribePars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id, subscribe } = validated.data;
  const pk = postPk(id);

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }
  if (metaResult.Item.terminalAt !== undefined) {
    return { ok: false, message: 'cannot change subscription on a closed item.', statusCode: 400 };
  }

  const now = Date.now();
  if (subscribe) {
    await client.send(new PutCommand({
      TableName: feedbackTable,
      Item: {
        pk,
        sk: subscribeSk(userId),
        entityType: 'subscribe',
        userId,
        createdAt: now,
        source: 'manual',
      },
    }));
    return { ok: true, data: { subscribed: true } };
  }

  await client.send(new DeleteCommand({
    TableName: feedbackTable,
    Key: { pk, sk: subscribeSk(userId) },
  }));
  return { ok: true, data: { subscribed: false } };
}

export async function feedbackSetStatus(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  adminUserId: string,
  pars: FeedbackSetStatusPars,
): Promise<FeedbackResult<{ status: string }>> {
  const feedbackTable = getFeedbackTableName(tableName);
  const idGuess = typeof pars.id === 'string' ? pars.id.trim() : '';
  if (!idGuess) {
    return { ok: false, message: 'id is required.', statusCode: 400 };
  }

  const pk = postPk(idGuess);
  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }

  const kind = metaResult.Item.kind as FeedbackMetaItem['kind'];
  const validated = validateFeedbackSetStatusPars(pars, kind);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const { id, status } = validated.data;
  const now = Date.now();
  const terminalAt = isTerminalStatus(kind, status) ? now : undefined;
  const createdAt = Number(metaResult.Item.createdAt);
  const effectiveVotes = Number(metaResult.Item.effectiveVotes ?? 0);
  const authorId = String(metaResult.Item.authorId);
  const title = String(metaResult.Item.title);

  const transactItems: Record<string, unknown>[] = [
    {
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: metaSk() },
        UpdateExpression: terminalAt !== undefined
          ? 'SET #status = :status, updatedAt = :ua, gsi2pk = :g2pk, gsi2sk = :g2sk, terminalAt = :ta'
          : 'SET #status = :status, updatedAt = :ua, gsi2pk = :g2pk, gsi2sk = :g2sk REMOVE terminalAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': status,
          ':ua': now,
          ':g2pk': statusGsi2Pk(kind, status),
          ':g2sk': String(createdAt),
          ...(terminalAt !== undefined ? { ':ta': terminalAt } : {}),
        },
      },
    },
  ];

  for (const sort of ['votes', 'recent', 'updated'] as const) {
    const values: Record<string, unknown> = {
      ':status': status,
      ':ua': now,
    };
    let updateExpression = 'SET #status = :status, updatedAt = :ua';
    if (sort === 'updated') {
      values[':gsi1sk'] = listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id);
      updateExpression += ', gsi1sk = :gsi1sk';
    }
    if (terminalAt !== undefined) {
      values[':ta'] = terminalAt;
      updateExpression += ', terminalAt = :ta';
    } else {
      updateExpression += ' REMOVE terminalAt';
    }
    transactItems.push({
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort(sort) },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: values,
      },
    });
  }

  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

  try {
    await notifyFeedbackStatusChange(client, feedbackTable, {
      postId: id,
      kind,
      title,
      authorId,
      status,
      actorId: adminUserId,
    });
  } catch (error) {
    console.error('notifyFeedbackStatusChange failed', error);
  }

  return { ok: true, data: { status } };
}

/** Test helper: seed a post with legacy vote count without going through create validation. */
export async function seedFeedbackPostForTests(
  client: DynamoDBDocumentClient,
  tableName: string,
  meta: FeedbackMetaItem,
): Promise<void> {
  const writes = [
    { Put: { TableName: tableName, Item: meta } },
    { Put: { TableName: tableName, Item: buildListIndexItem(meta, 'votes') } },
    { Put: { TableName: tableName, Item: buildListIndexItem(meta, 'recent') } },
    { Put: { TableName: tableName, Item: buildListIndexItem(meta, 'updated') } },
  ];
  await client.send(new TransactWriteCommand({ TransactItems: writes }));
}

export { buildMetaItem, buildListIndexItem, toPublicPost };
