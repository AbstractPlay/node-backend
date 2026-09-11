import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { isBotIdOnTable } from '../participants.js';
import type {
  FeedbackAdminListItem,
  FeedbackAdminListPars,
  FeedbackGetResult,
  FeedbackKind,
  FeedbackListSort,
  FeedbackMetaItem,
  FeedbackMinePars,
  FeedbackPresignUploadPars,
  FeedbackPublicComment,
  FeedbackPublicPost,
  FeedbackSetAdminFieldsPars,
  FeedbackSetStatusPars,
  FeedbackSubscribePars,
  FeedbackUpdatePars,
} from './types.js';
import { generateCommentId, generateEditId, generatePostId, normalizedGameUrlForDedup } from './ids.js';
import {
  commentSk,
  editSk,
  historyPk,
  HISTORY_LOOKUP_SK,
  kindGsi1Pk,
  listGsi1SkForSort,
  listSkForSort,
  listSortPrefix,
  metaSk,
  postIdLookupPk,
  postPk,
  statusGsi2Pk,
  subscribeSk,
  userIndexSk,
  userPostsSkPrefix,
  voteSk,
  USER_PK_PREFIX,
} from './keys.js';
import {
  assertStagingKeysOwned,
  assertStagingObjectsExist,
  deletePostAttachments,
  deleteS3Objects,
  finalizeAttachmentKeys,
  presignAttachmentGetUrls,
  presignAttachmentPutUrl,
} from './attachments.js';
import {
  notifyFeedbackComment,
  notifyFeedbackDeleted,
  notifyFeedbackReviewRequested,
  notifyFeedbackStatusChange,
} from './notifications.js';
import { isUserSubscribed, listSubscriberIds } from './subscribe.js';
import { toPublicHistorySummary } from './archive.js';
import { isTerminalStatus } from './status.js';
import {
  FEEDBACK_LIST_MAX_LIMIT,
  FEEDBACK_LIST_SORTS,
  FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT,
} from './constants.js';
import {
  validateFeedbackAdminListPars,
  validateFeedbackCommentPars,
  validateFeedbackCreatePars,
  validateFeedbackGetPars,
  validateFeedbackListPars,
  validateFeedbackMinePars,
  validateFeedbackPresignUploadPars,
  validateFeedbackSetAdminFieldsPars,
  validateFeedbackSetStatusPars,
  validateFeedbackSubscribePars,
  validateFeedbackUpdatePars,
  validateFeedbackDeletePars,
  validateFeedbackMergePars,
  validateFeedbackVotePars,
  validateFeedbackWishlistSearchPars,
  validateFeedbackHistoryListPars,
  validateFeedbackHoldRetentionPars,
  type ValidatedFeedbackCreate,
} from './validate.js';
import type {
  FeedbackCommentPars,
  FeedbackCreatePars,
  FeedbackGetPars,
  FeedbackHistoryListPars,
  FeedbackHoldRetentionPars,
  FeedbackHistorySummary,
  FeedbackListPars,
  FeedbackDeletePars,
  FeedbackMergePars,
  FeedbackResult,
  FeedbackVotePars,
  FeedbackWishlistSearchPars,
} from './types.js';

function getMainTableName(): string | undefined {
  return process.env.ABSTRACT_PLAY_TABLE;
}

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
  const mainTable = getMainTableName();
  if (!mainTable) {
    return false;
  }
  const result = await client.send(new GetCommand({
    TableName: mainTable,
    Key: { pk: 'USER', sk: userId },
  }));
  return result.Item?.admin === true;
}

async function loadAuthorName(
  client: DynamoDBDocumentClient,
  userId: string,
): Promise<string> {
  const mainTable = getMainTableName();
  if (!mainTable) {
    return 'Unknown';
  }
  const result = await client.send(new GetCommand({
    TableName: mainTable,
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
    | 'effort' | 'priority' | 'adminTags' | 'reviewers' | 'lastStaffCommentAt' | 'lastAuthorCommentAt'
    | 'gameUrl' | 'bggGameId' | 'normalizedGameUrl' | 'wishlistCategory' | 'wishlistCategoryNote'
    | 'legacyBggItemId' | 'legacyBggSubmitter'
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
    effort: meta.effort,
    priority: meta.priority,
    adminTags: meta.adminTags,
    reviewers: meta.reviewers,
    lastStaffCommentAt: meta.lastStaffCommentAt,
    lastAuthorCommentAt: meta.lastAuthorCommentAt,
    gameUrl: meta.gameUrl,
    bggGameId: meta.bggGameId,
    normalizedGameUrl: meta.normalizedGameUrl,
    wishlistCategory: meta.wishlistCategory,
    wishlistCategoryNote: meta.wishlistCategoryNote,
    legacyBggItemId: meta.legacyBggItemId,
    legacyBggSubmitter: meta.legacyBggSubmitter,
  };
}

function needsResponseFromMeta(item: Record<string, unknown>): boolean {
  if (item.terminalAt !== undefined) {
    return false;
  }
  const lastStaff = typeof item.lastStaffCommentAt === 'number' ? item.lastStaffCommentAt : undefined;
  const lastAuthor = typeof item.lastAuthorCommentAt === 'number' ? item.lastAuthorCommentAt : undefined;
  if (lastStaff === undefined) {
    return true;
  }
  if (lastAuthor === undefined) {
    return false;
  }
  return lastAuthor > lastStaff;
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
    normalizedGameUrl: data.normalizedGameUrl,
    wishlistCategory: data.wishlistCategory as FeedbackMetaItem['wishlistCategory'],
    legacyBggItemId: data.legacyBggItemId,
    legacyBggSubmitter: data.legacyBggSubmitter,
    gsi2pk: statusGsi2Pk(data.kind, data.status),
    gsi2sk: String(now),
  };
}

async function findWishlistDuplicateId(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  options: { bggGameId?: string; normalizedGameUrl?: string },
): Promise<string | undefined> {
  const feedbackTable = getFeedbackTableName(tableName);
  const { bggGameId, normalizedGameUrl } = options;
  if (!bggGameId && !normalizedGameUrl) {
    return undefined;
  }

  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: feedbackTable,
      IndexName: 'ByKind',
      KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': kindGsi1Pk('wishlist'),
        ':prefix': listSortPrefix('votes'),
      },
      FilterExpression: 'attribute_not_exists(terminalAt)',
      ScanIndexForward: false,
      Limit: 100,
      ExclusiveStartKey: lastKey,
    }));

    for (const item of result.Items ?? []) {
      if (bggGameId && item.bggGameId === bggGameId) {
        return String(item.id);
      }
      if (normalizedGameUrl && item.normalizedGameUrl === normalizedGameUrl) {
        return String(item.id);
      }
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return undefined;
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
    normalizedGameUrl: typeof item.normalizedGameUrl === 'string' ? item.normalizedGameUrl : undefined,
    legacyBggItemId: typeof item.legacyBggItemId === 'string' ? item.legacyBggItemId : undefined,
    legacyBggSubmitter: typeof item.legacyBggSubmitter === 'string' ? item.legacyBggSubmitter : undefined,
    wishlistCategory: item.wishlistCategory as FeedbackPublicPost['wishlistCategory'],
    wishlistCategoryNote: typeof item.wishlistCategoryNote === 'string' ? item.wishlistCategoryNote : undefined,
    effort: item.effort as FeedbackPublicPost['effort'],
    priority: typeof item.priority === 'string' ? item.priority : undefined,
    adminTags: Array.isArray(item.adminTags) ? item.adminTags as string[] : undefined,
    reviewers: Array.isArray(item.reviewers)
      ? item.reviewers.filter((reviewer): reviewer is { id: string; name: string } => (
        typeof reviewer === 'object'
        && reviewer !== null
        && typeof reviewer.id === 'string'
        && typeof reviewer.name === 'string'
      ))
      : undefined,
    archivedAt: typeof item.archivedAt === 'number' ? item.archivedAt : undefined,
    expiresAt: typeof item.expiresAt === 'number' ? item.expiresAt : undefined,
    retentionHold: item.retentionHold === true,
  };
}

function toAdminListItem(item: Record<string, unknown>): FeedbackAdminListItem {
  return {
    ...toPublicPost(item),
    needsResponse: needsResponseFromMeta(item),
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

  if (data.kind === 'wishlist') {
    const duplicateId = await findWishlistDuplicateId(client, tableName, {
      bggGameId: data.bggGameId,
      normalizedGameUrl: data.normalizedGameUrl ?? (data.gameUrl ? normalizedGameUrlForDedup(data.gameUrl) : undefined),
    });
    if (duplicateId) {
      return {
        ok: false,
        message: 'This game is already on the wishlist.',
        statusCode: 409,
        code: 'duplicate',
        existingId: duplicateId,
      };
    }
  }

  const meta = buildMetaItem(id, userId, authorName, { ...data, attachmentKeys }, now);
  meta.voteCount = 1;
  meta.effectiveVotes = meta.legacyVoteCount + 1;

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
    {
      Put: {
        TableName: feedbackTable,
        Item: {
          pk: postPk(id),
          sk: voteSk(userId),
          entityType: 'vote',
          userId,
          createdAt: now,
        },
      },
    },
  ];

  await client.send(new TransactWriteCommand({ TransactItems: writes }));
  return { ok: true, data: { id } };
}

function encodeFeedbackListCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeFeedbackListCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
}

function feedbackListCursorFromItem(item: Record<string, unknown>): string {
  return encodeFeedbackListCursor({
    gsi1pk: item.gsi1pk,
    gsi1sk: item.gsi1sk,
    pk: item.pk,
    sk: item.sk,
  });
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

  const collected: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined = cursor
    ? decodeFeedbackListCursor(cursor)
    : undefined;

  while (collected.length < limit + 1) {
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
      ExclusiveStartKey: exclusiveStartKey,
    }));

    for (const item of result.Items ?? []) {
      collected.push(item);
      if (collected.length >= limit + 1) {
        break;
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey;
    if (!exclusiveStartKey) {
      break;
    }
  }

  const rawItems = collected.slice(0, limit);
  const items = rawItems.map((item) => toPublicPost(item));
  let nextCursor: string | undefined;
  if (rawItems.length > 0) {
    if (collected.length > limit) {
      nextCursor = feedbackListCursorFromItem(rawItems[rawItems.length - 1]!);
    } else if (exclusiveStartKey) {
      nextCursor = encodeFeedbackListCursor(exclusiveStartKey);
    }
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
    const lookup = await client.send(new GetCommand({
      TableName: feedbackTable,
      Key: { pk: postIdLookupPk(id), sk: HISTORY_LOOKUP_SK },
    }));
    if (!lookup.Item) {
      return { ok: false, message: 'feedback item not found.', statusCode: 404 };
    }
    return {
      ok: true,
      data: {
        comments: [],
        attachmentUrls: [],
        archived: true,
        purged: true,
        summary: toPublicHistorySummary(lookup.Item),
      },
    };
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

  const archived = metaResult.Item.archivedAt !== undefined;
  return {
    ok: true,
    data: {
      post,
      comments,
      attachmentUrls,
      subscribed,
      userVoted,
      ...(archived ? { archived: true } : {}),
    },
  };
}

export async function feedbackHistoryList(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  pars: FeedbackHistoryListPars,
): Promise<FeedbackResult<{ items: FeedbackHistorySummary[]; nextCursor?: string }>> {
  const validated = validateFeedbackHistoryListPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { kind, limit, cursor } = validated.data;
  const pk = historyPk(kind);

  const result = await client.send(new QueryCommand({
    TableName: feedbackTable,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': pk },
    ScanIndexForward: false,
    Limit: limit + 1,
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
  }));

  const rawItems = (result.Items ?? []).slice(0, limit);
  const items = rawItems.map((item) => toPublicHistorySummary(item));

  let nextCursor: string | undefined;
  if ((result.Items ?? []).length > limit && rawItems.length > 0) {
    const last = rawItems[rawItems.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({ pk: last.pk, sk: last.sk })).toString('base64url');
  }

  return { ok: true, data: { items, nextCursor } };
}

export async function feedbackHoldRetention(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  adminUserId: string,
  pars: FeedbackHoldRetentionPars,
): Promise<FeedbackResult<{ retentionHold: boolean }>> {
  const validated = validateFeedbackHoldRetentionPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const isAdmin = await loadIsAdmin(client, adminUserId);
  if (!isAdmin) {
    return { ok: false, message: 'admin only.', statusCode: 403 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id, hold } = validated.data;
  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk: postPk(id), sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }

  if (hold) {
    await client.send(new UpdateCommand({
      TableName: feedbackTable,
      Key: { pk: postPk(id), sk: metaSk() },
      UpdateExpression: 'SET retentionHold = :hold',
      ExpressionAttributeValues: { ':hold': true },
    }));
    return { ok: true, data: { retentionHold: true } };
  }

  await client.send(new UpdateCommand({
    TableName: feedbackTable,
    Key: { pk: postPk(id), sk: metaSk() },
    UpdateExpression: 'REMOVE retentionHold',
  }));
  return { ok: true, data: { retentionHold: false } };
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

  for (const sort of FEEDBACK_LIST_SORTS) {
    const values: Record<string, unknown> = {
      ':vc': nextVoteCount,
      ':ev': effectiveVotes,
      ':ua': now,
    };
    let updateExpression = 'SET voteCount = :vc, effectiveVotes = :ev, updatedAt = :ua';
    if (sort === 'votes') {
      values[':gsi1sk'] = listGsi1SkForSort('votes', effectiveVotes, createdAt, now, id);
      updateExpression += ', gsi1sk = :gsi1sk';
    } else if (sort === 'updated') {
      values[':gsi1sk'] = listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id);
      updateExpression += ', gsi1sk = :gsi1sk';
    }
    transactItems.push({
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort(sort) },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
      },
    });
  }

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
  const authorId = String(metaResult.Item.authorId);
  let metaUpdateExpression = 'SET commentCount = :cc, updatedAt = :ua';
  const metaUpdateValues: Record<string, unknown> = {
    ':cc': commentCount,
    ':ua': now,
  };
  if (isStaff) {
    metaUpdateExpression += ', lastStaffCommentAt = :lsa';
    metaUpdateValues[':lsa'] = now;
  } else if (userId === authorId) {
    metaUpdateExpression += ', lastAuthorCommentAt = :laa';
    metaUpdateValues[':laa'] = now;
  }

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
        UpdateExpression: metaUpdateExpression,
        ExpressionAttributeValues: metaUpdateValues,
      },
    },
  ];

  for (const sort of FEEDBACK_LIST_SORTS) {
    const values: Record<string, unknown> = {
      ':cc': commentCount,
      ':ua': now,
    };
    let updateExpression = 'SET commentCount = :cc, updatedAt = :ua';
    if (isStaff) {
      values[':lsa'] = now;
      updateExpression += ', lastStaffCommentAt = :lsa';
    } else if (userId === authorId) {
      values[':laa'] = now;
      updateExpression += ', lastAuthorCommentAt = :laa';
    }
    if (sort === 'updated') {
      values[':gsi1sk'] = listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id);
      updateExpression += ', gsi1sk = :gsi1sk';
    }
    transactItems.push({
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort(sort) },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
      },
    });
  }

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

  for (const sort of FEEDBACK_LIST_SORTS) {
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

async function canEditPost(
  client: DynamoDBDocumentClient,
  userId: string,
  meta: Record<string, unknown>,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) {
    return true;
  }
  return String(meta.authorId) === userId;
}

function pushListProjectionFieldUpdates(
  transactItems: Record<string, unknown>[],
  feedbackTable: string,
  pk: string,
  id: string,
  now: number,
  createdAt: number,
  effectiveVotes: number,
  setParts: string[],
  values: Record<string, unknown>,
): void {
  for (const sort of FEEDBACK_LIST_SORTS) {
    const rowValues: Record<string, unknown> = { ...values, ':ua': now };
    let updateExpression = setParts.length > 0
      ? `SET ${setParts.join(', ')}, updatedAt = :ua`
      : 'SET updatedAt = :ua';
    if (sort === 'updated') {
      rowValues[':gsi1sk'] = listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id);
      updateExpression += ', gsi1sk = :gsi1sk';
    }
    transactItems.push({
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort(sort) },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: rowValues,
      },
    });
  }
}

function pushListProjectionFieldRemoves(
  transactItems: Record<string, unknown>[],
  feedbackTable: string,
  pk: string,
  id: string,
  now: number,
  createdAt: number,
  effectiveVotes: number,
  removeParts: string[],
): void {
  if (removeParts.length === 0) {
    return;
  }
  const removeExpr = removeParts.join(', ');
  for (const sort of FEEDBACK_LIST_SORTS) {
    const rowValues: Record<string, unknown> = { ':ua': now };
    let updateExpression = `SET updatedAt = :ua REMOVE ${removeExpr}`;
    if (sort === 'updated') {
      rowValues[':gsi1sk'] = listGsi1SkForSort('updated', effectiveVotes, createdAt, now, id);
      updateExpression = `SET updatedAt = :ua, gsi1sk = :gsi1sk REMOVE ${removeExpr}`;
    }
    transactItems.push({
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort(sort) },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: rowValues,
      },
    });
  }
}

export async function feedbackUpdate(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  s3: S3Client,
  userId: string,
  pars: FeedbackUpdatePars,
  isAdmin: boolean,
): Promise<FeedbackResult<{ id: string }>> {
  const validated = validateFeedbackUpdatePars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id, title, body, attachmentKeys } = validated.data;
  const pk = postPk(id);

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }
  if (metaResult.Item.terminalAt !== undefined) {
    return { ok: false, message: 'cannot edit a closed item.', statusCode: 400 };
  }
  if (!(await canEditPost(client, userId, metaResult.Item, isAdmin))) {
    return { ok: false, message: 'only the author or an admin may edit this item.', statusCode: 403 };
  }

  const now = Date.now();
  const editId = generateEditId();
  const createdAt = Number(metaResult.Item.createdAt);
  const effectiveVotes = Number(metaResult.Item.effectiveVotes ?? 0);
  const metaSetParts = ['updatedAt = :ua'];
  const metaValues: Record<string, unknown> = { ':ua': now };
  const listSetParts = ['updatedAt = :ua'];
  const listValues: Record<string, unknown> = { ':ua': now };
  const transactItems: Record<string, unknown>[] = [];

  if (title !== undefined) {
    metaSetParts.push('title = :title');
    metaValues[':title'] = title;
    listSetParts.push('title = :title');
    listValues[':title'] = title;
    transactItems.push({
      Put: {
        TableName: feedbackTable,
        Item: {
          pk,
          sk: editSk(now, editId),
          entityType: 'edit',
          editId,
          editorId: userId,
          field: 'title',
          previousValue: String(metaResult.Item.title),
          newValue: title,
          createdAt: now,
        },
      },
    });
  }
  if (body !== undefined) {
    metaSetParts.push('body = :body');
    metaValues[':body'] = body;
    transactItems.push({
      Put: {
        TableName: feedbackTable,
        Item: {
          pk,
          sk: editSk(now + 1, `${editId}-body`),
          entityType: 'edit',
          editId: `${editId}-body`,
          editorId: userId,
          field: 'body',
          previousValue: typeof metaResult.Item.body === 'string' ? metaResult.Item.body : '',
          newValue: body,
          createdAt: now,
        },
      },
    });
  }

  transactItems.push({
    Update: {
      TableName: feedbackTable,
      Key: { pk, sk: metaSk() },
      UpdateExpression: `SET ${metaSetParts.join(', ')}`,
      ExpressionAttributeValues: metaValues,
    },
  });
  if (title !== undefined) {
    pushListProjectionFieldUpdates(
      transactItems,
      feedbackTable,
      pk,
      id,
      now,
      createdAt,
      effectiveVotes,
      listSetParts.filter((part) => part !== 'updatedAt = :ua'),
      listValues,
    );
  } else {
    pushListProjectionFieldUpdates(
      transactItems,
      feedbackTable,
      pk,
      id,
      now,
      createdAt,
      effectiveVotes,
      [],
      {},
    );
  }

  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

  if (attachmentKeys !== undefined) {
    const kind = metaResult.Item.kind;
    if (kind !== 'wishlist') {
      return { ok: false, message: 'only wishlist entries support cover images.', statusCode: 400 };
    }
    if (attachmentKeys.length > FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT) {
      return {
        ok: false,
        message: `wishlist entries allow at most ${FEEDBACK_WISHLIST_ATTACHMENT_MAX_COUNT} image.`,
        statusCode: 400,
      };
    }
    let nextKeys: string[] = [];
    if (attachmentKeys.length > 0) {
      const keyCheck = assertStagingKeysOwned(userId, attachmentKeys);
      if (!keyCheck.ok) {
        return { ok: false, message: keyCheck.message, statusCode: 400 };
      }
      const exists = await assertStagingObjectsExist(s3, attachmentKeys);
      if (!exists.ok) {
        return { ok: false, message: exists.message, statusCode: 400 };
      }
      nextKeys = await finalizeAttachmentKeys(s3, userId, id, attachmentKeys);
    }
    const attachResult = await setFeedbackPostAttachmentKeys(client, tableName, id, nextKeys, s3);
    if (!attachResult.ok) {
      return attachResult;
    }
  }

  return { ok: true, data: { id } };
}

async function resolveReviewers(
  client: DynamoDBDocumentClient,
  reviewerIds: string[],
): Promise<FeedbackResult<{ reviewers: { id: string; name: string }[] }>> {
  const reviewers: { id: string; name: string }[] = [];
  for (const reviewerId of reviewerIds) {
    if (await isBotIdOnTable(client, getMainTableName(), reviewerId)) {
      return { ok: false, message: 'bots cannot be reviewers.', statusCode: 400 };
    }
    const name = await loadAuthorName(client, reviewerId);
    if (name === 'Unknown') {
      return { ok: false, message: `unknown user id: ${reviewerId}`, statusCode: 400 };
    }
    reviewers.push({ id: reviewerId, name });
  }
  return { ok: true, data: { reviewers } };
}

export async function feedbackSetAdminFields(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  actorUserId: string,
  pars: FeedbackSetAdminFieldsPars,
): Promise<FeedbackResult<{ id: string }>> {
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

  const kind = metaResult.Item.kind as FeedbackKind;
  const validated = validateFeedbackSetAdminFieldsPars(pars, kind);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const {
    id,
    effort,
    priority,
    adminTags,
    reviewerIds,
    wishlistCategory,
    wishlistCategoryNote,
  } = validated.data;
  const now = Date.now();
  const createdAt = Number(metaResult.Item.createdAt);
  const effectiveVotes = Number(metaResult.Item.effectiveVotes ?? 0);
  const metaSetParts = ['updatedAt = :ua'];
  const metaValues: Record<string, unknown> = { ':ua': now };
  const metaRemoveParts: string[] = [];
  const listSetParts: string[] = [];
  const listValues: Record<string, unknown> = {};
  const listRemoveParts: string[] = [];

  if (effort !== undefined) {
    metaSetParts.push('effort = :effort');
    metaValues[':effort'] = effort;
    listSetParts.push('effort = :effort');
    listValues[':effort'] = effort;
  }
  if (priority !== undefined) {
    if (priority === null) {
      metaRemoveParts.push('priority');
      listRemoveParts.push('priority');
    } else {
      metaSetParts.push('priority = :priority');
      metaValues[':priority'] = priority;
      listSetParts.push('priority = :priority');
      listValues[':priority'] = priority;
    }
  }
  if (adminTags !== undefined) {
    metaSetParts.push('adminTags = :adminTags');
    metaValues[':adminTags'] = adminTags;
    listSetParts.push('adminTags = :adminTags');
    listValues[':adminTags'] = adminTags;
  }
  if (wishlistCategory !== undefined) {
    metaSetParts.push('wishlistCategory = :wishlistCategory');
    metaValues[':wishlistCategory'] = wishlistCategory;
    listSetParts.push('wishlistCategory = :wishlistCategory');
    listValues[':wishlistCategory'] = wishlistCategory;
  }
  if (wishlistCategoryNote !== undefined) {
    metaSetParts.push('wishlistCategoryNote = :wishlistCategoryNote');
    metaValues[':wishlistCategoryNote'] = wishlistCategoryNote;
    listSetParts.push('wishlistCategoryNote = :wishlistCategoryNote');
    listValues[':wishlistCategoryNote'] = wishlistCategoryNote;
  }

  let newlyAddedReviewerIds: string[] = [];
  if (reviewerIds !== undefined) {
    const resolved = await resolveReviewers(client, reviewerIds);
    if (!resolved.ok) {
      return resolved;
    }
    const previousReviewers = Array.isArray(metaResult.Item.reviewers)
      ? metaResult.Item.reviewers.filter((reviewer): reviewer is { id: string; name: string } => (
        typeof reviewer === 'object'
        && reviewer !== null
        && typeof reviewer.id === 'string'
      ))
      : [];
    const previousIds = new Set(previousReviewers.map((reviewer) => reviewer.id));
    newlyAddedReviewerIds = resolved.data.reviewers
      .filter((reviewer) => !previousIds.has(reviewer.id))
      .map((reviewer) => reviewer.id);
    if (resolved.data.reviewers.length === 0) {
      metaRemoveParts.push('reviewers');
      listRemoveParts.push('reviewers');
    } else {
      metaSetParts.push('reviewers = :reviewers');
      metaValues[':reviewers'] = resolved.data.reviewers;
      listSetParts.push('reviewers = :reviewers');
      listValues[':reviewers'] = resolved.data.reviewers;
    }
  }

  const metaUpdateParts = [`SET ${metaSetParts.join(', ')}`];
  if (metaRemoveParts.length > 0) {
    metaUpdateParts.push(`REMOVE ${metaRemoveParts.join(', ')}`);
  }

  const transactItems: Record<string, unknown>[] = [{
    Update: {
      TableName: feedbackTable,
      Key: { pk, sk: metaSk() },
      UpdateExpression: metaUpdateParts.join(' '),
      ExpressionAttributeValues: metaValues,
    },
  }];

  if (listSetParts.length > 0) {
    pushListProjectionFieldUpdates(
      transactItems,
      feedbackTable,
      pk,
      id,
      now,
      createdAt,
      effectiveVotes,
      listSetParts,
      listValues,
    );
  }
  if (listRemoveParts.length > 0) {
    pushListProjectionFieldRemoves(
      transactItems,
      feedbackTable,
      pk,
      id,
      now,
      createdAt,
      effectiveVotes,
      listRemoveParts,
    );
  }

  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

  if (newlyAddedReviewerIds.length > 0) {
    try {
      await notifyFeedbackReviewRequested(client, feedbackTable, {
        postId: id,
        kind,
        title: String(metaResult.Item.title),
        reviewerIds: newlyAddedReviewerIds,
        actorId: actorUserId,
      });
    } catch (error) {
      console.error('notifyFeedbackReviewRequested failed', error);
    }
  }

  return { ok: true, data: { id } };
}

export async function feedbackMine(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  userId: string,
  pars: FeedbackMinePars,
): Promise<FeedbackResult<{ items: FeedbackPublicPost[]; nextCursor?: string }>> {
  const validated = validateFeedbackMinePars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { kind, limit, cursor } = validated.data;
  const pk = `${USER_PK_PREFIX}${userId}`;

  const result = await client.send(new QueryCommand({
    TableName: feedbackTable,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':prefix': userPostsSkPrefix(),
    },
    ScanIndexForward: false,
    Limit: limit + 1,
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
  }));

  let indexItems = (result.Items ?? []);
  if (kind) {
    indexItems = indexItems.filter((item) => item.kind === kind);
  }
  indexItems = indexItems.slice(0, limit);

  const items: FeedbackPublicPost[] = [];
  for (const indexItem of indexItems) {
    const postId = String(indexItem.id);
    const metaResult = await client.send(new GetCommand({
      TableName: feedbackTable,
      Key: { pk: postPk(postId), sk: metaSk() },
    }));
    if (metaResult.Item) {
      items.push(toPublicPost(metaResult.Item));
    }
  }

  let nextCursor: string | undefined;
  if ((result.Items ?? []).length > limit && indexItems.length > 0) {
    const last = indexItems[indexItems.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify({
      pk: last.pk,
      sk: last.sk,
    })).toString('base64url');
  }

  return { ok: true, data: { items, nextCursor } };
}

export async function feedbackAdminList(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  pars: FeedbackAdminListPars,
): Promise<FeedbackResult<{ items: FeedbackAdminListItem[]; nextCursor?: string }>> {
  const validated = validateFeedbackAdminListPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { kind, status, effort, priority, needsResponse, limit, cursor } = validated.data;

  let result;
  if (status) {
    result = await client.send(new QueryCommand({
      TableName: feedbackTable,
      IndexName: 'ByStatus',
      KeyConditionExpression: 'gsi2pk = :pk',
      FilterExpression: 'entityType = :entityType',
      ExpressionAttributeValues: {
        ':pk': statusGsi2Pk(kind, status),
        ':entityType': 'meta',
      },
      ScanIndexForward: false,
      Limit: limit + 1,
      ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
    }));
  } else {
    result = await client.send(new QueryCommand({
      TableName: feedbackTable,
      IndexName: 'ByKind',
      KeyConditionExpression: 'gsi1pk = :pk AND begins_with(gsi1sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': kindGsi1Pk(kind),
        ':prefix': listSortPrefix('recent'),
      },
      FilterExpression: 'attribute_not_exists(terminalAt)',
      ScanIndexForward: false,
      Limit: limit + 1,
      ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
    }));
  }

  let rawItems = (result.Items ?? []);
  if (effort) {
    rawItems = rawItems.filter((item) => item.effort === effort);
  }
  if (priority) {
    rawItems = rawItems.filter((item) => item.priority === priority);
  }
  if (needsResponse) {
    rawItems = rawItems.filter((item) => needsResponseFromMeta(item));
  }
  rawItems = rawItems.slice(0, limit);

  const items = rawItems.map((item) => toAdminListItem(item));
  let nextCursor: string | undefined;
  if ((result.Items ?? []).length > limit && rawItems.length > 0) {
    const last = rawItems[rawItems.length - 1]!;
    nextCursor = Buffer.from(JSON.stringify(
      status
        ? { gsi2pk: last.gsi2pk, gsi2sk: last.gsi2sk, pk: last.pk, sk: last.sk }
        : { gsi1pk: last.gsi1pk, gsi1sk: last.gsi1sk, pk: last.pk, sk: last.sk },
    )).toString('base64url');
  }

  return { ok: true, data: { items, nextCursor } };
}

export async function feedbackWishlistSearch(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  pars: FeedbackWishlistSearchPars,
): Promise<FeedbackResult<{ items: FeedbackPublicPost[] }>> {
  const validated = validateFeedbackWishlistSearchPars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const listResult = await feedbackList(client, tableName, {
    kind: 'wishlist',
    sort: 'votes',
    limit: FEEDBACK_LIST_MAX_LIMIT,
  });
  if (!listResult.ok) {
    return listResult;
  }

  const needle = validated.data.q.toLowerCase();
  const items = listResult.data.items
    .filter((item) => item.title.toLowerCase().includes(needle))
    .slice(0, validated.data.limit);

  return { ok: true, data: { items } };
}

export async function feedbackMerge(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  s3: S3Client,
  pars: FeedbackMergePars,
): Promise<FeedbackResult<{ survivorId: string; duplicateId: string }>> {
  const validated = validateFeedbackMergePars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { survivorId, duplicateId } = validated.data;

  const survivorMeta = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk: postPk(survivorId), sk: metaSk() },
  }));
  const duplicateMeta = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk: postPk(duplicateId), sk: metaSk() },
  }));
  if (!survivorMeta.Item || !duplicateMeta.Item) {
    return { ok: false, message: 'survivor or duplicate not found.', statusCode: 404 };
  }
  if (survivorMeta.Item.kind !== 'wishlist' || duplicateMeta.Item.kind !== 'wishlist') {
    return { ok: false, message: 'merge is only supported for wishlist items.', statusCode: 400 };
  }

  const survivorVotes = Number(survivorMeta.Item.voteCount ?? 0);
  const duplicateVotes = Number(duplicateMeta.Item.voteCount ?? 0);
  const survivorLegacy = Number(survivorMeta.Item.legacyVoteCount ?? 0);
  const duplicateLegacy = Number(duplicateMeta.Item.legacyVoteCount ?? 0);
  const survivorComments = Number(survivorMeta.Item.commentCount ?? 0);
  const duplicateComments = Number(duplicateMeta.Item.commentCount ?? 0);
  const newVoteCount = survivorVotes + duplicateVotes;
  const newLegacyVoteCount = survivorLegacy + duplicateLegacy;
  const newEffectiveVotes = newVoteCount + newLegacyVoteCount;
  const newCommentCount = survivorComments + duplicateComments;
  const now = Date.now();
  const createdAt = Number(survivorMeta.Item.createdAt);
  const survivorPk = postPk(survivorId);
  const duplicatePk = postPk(duplicateId);

  const duplicateRows = await client.send(new QueryCommand({
    TableName: feedbackTable,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': duplicatePk },
  }));

  const survivorUpdates: Record<string, unknown>[] = [{
    Update: {
      TableName: feedbackTable,
      Key: { pk: survivorPk, sk: metaSk() },
      UpdateExpression: 'SET voteCount = :vc, legacyVoteCount = :lvc, effectiveVotes = :ev, commentCount = :cc, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':vc': newVoteCount,
        ':lvc': newLegacyVoteCount,
        ':ev': newEffectiveVotes,
        ':cc': newCommentCount,
        ':ua': now,
      },
    },
  }];

  for (const sort of FEEDBACK_LIST_SORTS) {
    const values: Record<string, unknown> = {
      ':vc': newVoteCount,
      ':lvc': newLegacyVoteCount,
      ':ev': newEffectiveVotes,
      ':cc': newCommentCount,
      ':ua': now,
    };
    let updateExpression = 'SET voteCount = :vc, legacyVoteCount = :lvc, effectiveVotes = :ev, commentCount = :cc, updatedAt = :ua';
    if (sort === 'votes') {
      values[':gsi1sk'] = listGsi1SkForSort('votes', newEffectiveVotes, createdAt, createdAt, survivorId);
      updateExpression += ', gsi1sk = :gsi1sk';
    }
    if (sort === 'updated') {
      values[':gsi1skUpdated'] = listGsi1SkForSort('updated', newEffectiveVotes, createdAt, now, survivorId);
      updateExpression += ', gsi1sk = :gsi1skUpdated';
    }
    survivorUpdates.push({
      Update: {
        TableName: feedbackTable,
        Key: { pk: survivorPk, sk: listSkForSort(sort) },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
      },
    });
  }

  await client.send(new TransactWriteCommand({ TransactItems: survivorUpdates }));

  for (const row of duplicateRows.Items ?? []) {
    const sk = String(row.sk);
    if (sk.startsWith('COMMENT#')) {
      await client.send(new PutCommand({
        TableName: feedbackTable,
        Item: { ...row, pk: survivorPk },
      }));
    }
    await client.send(new DeleteCommand({
      TableName: feedbackTable,
      Key: { pk: row.pk, sk: row.sk },
    }));
  }

  const duplicateAttachmentKeys = Array.isArray(duplicateMeta.Item.attachmentKeys)
    ? duplicateMeta.Item.attachmentKeys as string[]
    : undefined;
  try {
    await deletePostAttachments(s3, duplicateId, duplicateAttachmentKeys);
  } catch (error) {
    console.error('deletePostAttachments failed during feedbackMerge', error);
  }

  return { ok: true, data: { survivorId, duplicateId } };
}

export async function feedbackDelete(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  s3: S3Client,
  adminUserId: string,
  pars: FeedbackDeletePars,
): Promise<FeedbackResult<{ id: string }>> {
  const validated = validateFeedbackDeletePars(pars);
  if (!validated.ok) {
    return { ok: false, message: validated.message, statusCode: 400 };
  }

  const feedbackTable = getFeedbackTableName(tableName);
  const { id, reason } = validated.data;
  const pk = postPk(id);

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }

  const kind = metaResult.Item.kind as FeedbackKind;
  if (kind !== 'wishlist') {
    return { ok: false, message: 'only wishlist items can be deleted.', statusCode: 400 };
  }

  const authorId = String(metaResult.Item.authorId);
  const title = String(metaResult.Item.title);
  const createdAt = Number(metaResult.Item.createdAt);
  const attachmentKeys = Array.isArray(metaResult.Item.attachmentKeys)
    ? metaResult.Item.attachmentKeys as string[]
    : undefined;
  const subscriberIds = await listSubscriberIds(client, feedbackTable, id);

  try {
    await deletePostAttachments(s3, id, attachmentKeys);
  } catch (error) {
    console.error('deletePostAttachments failed during feedbackDelete', error);
  }

  const postRows = await client.send(new QueryCommand({
    TableName: feedbackTable,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': pk },
  }));

  for (const row of postRows.Items ?? []) {
    await client.send(new DeleteCommand({
      TableName: feedbackTable,
      Key: { pk: row.pk, sk: row.sk },
    }));
  }

  await client.send(new DeleteCommand({
    TableName: feedbackTable,
    Key: {
      pk: `${USER_PK_PREFIX}${authorId}`,
      sk: userIndexSk(kind, createdAt, id),
    },
  }));

  try {
    await notifyFeedbackDeleted(client, feedbackTable, {
      kind,
      title,
      authorId,
      reason,
      actorId: adminUserId,
      subscriberIds,
    });
  } catch (error) {
    console.error('notifyFeedbackDeleted failed', error);
  }

  return { ok: true, data: { id } };
}

export async function setFeedbackPostAttachmentKeys(
  client: DynamoDBDocumentClient,
  tableName: string | undefined,
  postId: string,
  attachmentKeys: string[],
  s3?: S3Client,
): Promise<FeedbackResult<{ id: string }>> {
  const feedbackTable = getFeedbackTableName(tableName);
  const pk = postPk(postId);
  const now = Date.now();

  const metaResult = await client.send(new GetCommand({
    TableName: feedbackTable,
    Key: { pk, sk: metaSk() },
  }));
  if (!metaResult.Item) {
    return { ok: false, message: 'feedback item not found.', statusCode: 404 };
  }

  const previousKeys = Array.isArray(metaResult.Item.attachmentKeys)
    ? metaResult.Item.attachmentKeys.filter((key): key is string => typeof key === 'string' && key.trim() !== '')
    : [];
  const nextKeys = attachmentKeys.filter((key) => key.trim() !== '');
  const keysToDelete = previousKeys.filter((key) => !nextKeys.includes(key));

  const transactItems = [
    {
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: metaSk() },
        UpdateExpression: 'SET attachmentKeys = :keys, updatedAt = :ua',
        ExpressionAttributeValues: {
          ':keys': nextKeys,
          ':ua': now,
        },
      },
    },
    ...FEEDBACK_LIST_SORTS.map((sort) => ({
      Update: {
        TableName: feedbackTable,
        Key: { pk, sk: listSkForSort(sort) },
        UpdateExpression: 'SET attachmentKeys = :keys',
        ExpressionAttributeValues: { ':keys': nextKeys },
      },
    })),
  ];

  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

  if (s3 && keysToDelete.length > 0) {
    try {
      await deleteS3Objects(s3, keysToDelete);
    } catch (error) {
      console.error('deleteS3Objects failed during setFeedbackPostAttachmentKeys', error);
    }
  }

  return { ok: true, data: { id: postId } };
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
