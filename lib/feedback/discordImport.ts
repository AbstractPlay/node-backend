import type { ApUsernameIndex } from './bggImport.js';
import { generateCommentId, generatePostId } from './ids.js';
import { commentSk, kindGsi1Pk, listGsi1SkForSort, listSkForSort, metaSk, postPk, statusGsi2Pk } from './keys.js';
import type { FeedbackKind, FeedbackMetaItem } from './types.js';

export const DISCORD_IMPORT_AUTHOR_ID = '00000000-0000-4000-8000-000000000002';

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
};

export type DiscordForumTag = {
  id: string;
  name: string;
};

export type DiscordThread = {
  id: string;
  name: string;
  owner_id: string;
  applied_tags?: string[];
  thread_metadata?: {
    create_timestamp?: string;
  };
};

export type DiscordAttachment = {
  id: string;
  url: string;
  content_type?: string;
  filename?: string;
};

export type DiscordMessage = {
  id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  attachments?: DiscordAttachment[];
};

export type DiscordImportConfig = {
  guildId: string;
  bugForumChannelId: string;
  featureForumChannelId: string;
  excludeTagsByKind: {
    bug: string[];
    feature: string[];
  };
  staffBotUserIds?: string[];
};

export type ResolvedDiscordAuthor = {
  authorId: string;
  authorName: string;
  legacyDiscordUserId?: string;
  legacyDiscordUsername?: string;
};

export type PlannedDiscordComment = {
  pk: string;
  sk: string;
  entityType: 'comment';
  commentId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  isStaff?: boolean;
  legacyDiscordMessageId: string;
  legacyDiscordUserId?: string;
  legacyDiscordUsername?: string;
};

export type PlannedDiscordImport = {
  meta: FeedbackMetaItem;
  comments: PlannedDiscordComment[];
  listRows: Record<string, unknown>[];
};

export function discordUserDisplayName(user: DiscordUser): string {
  const globalName = user.global_name?.trim();
  if (globalName) {
    return globalName;
  }
  return user.username;
}

export function parseDiscordTimestamp(iso: string | undefined): number {
  if (!iso) {
    return Date.now();
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function resolveExcludeTagIds(
  availableTags: DiscordForumTag[],
  excludeTagNames: string[],
): Set<string> {
  const wanted = new Set(excludeTagNames.map((name) => name.toUpperCase()));
  const ids = new Set<string>();
  for (const tag of availableTags) {
    if (wanted.has(tag.name.toUpperCase())) {
      ids.add(tag.id);
    }
  }
  return ids;
}

export function shouldImportThread(thread: DiscordThread, excludeTagIds: Set<string>): boolean {
  if (excludeTagIds.size === 0) {
    return true;
  }
  const applied = thread.applied_tags ?? [];
  return !applied.some((tagId) => excludeTagIds.has(tagId));
}

export function formatDiscordMessageBody(
  content: string,
  attachments?: DiscordAttachment[],
): string {
  let body = content.trim();
  if (attachments && attachments.length > 0) {
    const lines = attachments.map((attachment) => {
      const label = attachment.filename || attachment.url;
      return `[attachment: ${label}](${attachment.url})`;
    });
    body = body ? `${body}\n\n${lines.join('\n')}` : lines.join('\n');
  }
  return body;
}

export function buildDiscordUsernameToUserId(index: ApUsernameIndex): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [lower, entries] of index.lowerToEntries) {
    if (entries.length === 1) {
      out[lower] = entries[0]!.id;
    }
  }
  return out;
}

export function isUnmappedDiscordAuthor(author: ResolvedDiscordAuthor): boolean {
  return author.authorId === DISCORD_IMPORT_AUTHOR_ID;
}

export function resolveDiscordAuthor(
  user: DiscordUser,
  options: {
    userMap: Record<string, string>;
    usernameToUserId?: Record<string, string>;
  },
): ResolvedDiscordAuthor {
  const displayName = discordUserDisplayName(user);
  const mapped = options.userMap[user.id];
  if (mapped) {
    return { authorId: mapped, authorName: displayName };
  }
  const usernameKey = user.username.toLowerCase();
  const userIdFromUsername = options.usernameToUserId?.[usernameKey];
  if (userIdFromUsername) {
    return { authorId: userIdFromUsername, authorName: displayName };
  }
  return {
    authorId: DISCORD_IMPORT_AUTHOR_ID,
    authorName: displayName,
    legacyDiscordUserId: user.id,
    legacyDiscordUsername: user.username,
  };
}

export function isStaffDiscordUser(user: DiscordUser, staffBotUserIds?: Set<string>): boolean {
  if (user.bot) {
    return true;
  }
  return staffBotUserIds?.has(user.id) ?? false;
}

export function sortDiscordMessagesOldestFirst(messages: DiscordMessage[]): DiscordMessage[] {
  return [...messages].sort(
    (a, b) => parseDiscordTimestamp(a.timestamp) - parseDiscordTimestamp(b.timestamp),
  );
}

export function buildDiscordListRowsFromMeta(meta: FeedbackMetaItem): Record<string, unknown>[] {
  return (['votes', 'recent', 'updated'] as const).map((sort) => ({
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
    lastStaffCommentAt: meta.lastStaffCommentAt,
    lastAuthorCommentAt: meta.lastAuthorCommentAt,
    legacyDiscordThreadId: meta.legacyDiscordThreadId,
    pk: meta.pk,
    sk: listSkForSort(sort),
    entityType: 'list',
    gsi1pk: kindGsi1Pk(meta.kind),
    gsi1sk: listGsi1SkForSort(sort, meta.effectiveVotes, meta.createdAt, meta.updatedAt, meta.id),
  }));
}

export function planDiscordThreadImport(params: {
  kind: Extract<FeedbackKind, 'bug' | 'feature'>;
  thread: DiscordThread;
  messagesNewestFirst: DiscordMessage[];
  userMap: Record<string, string>;
  usernameToUserId?: Record<string, string>;
  staffBotUserIds?: Set<string>;
  postId?: string;
}): PlannedDiscordImport | { ok: false; message: string } {
  const sorted = sortDiscordMessagesOldestFirst(params.messagesNewestFirst);
  if (sorted.length === 0) {
    return { ok: false, message: 'thread has no messages.' };
  }

  const starter = sorted[0]!;
  const replies = sorted.slice(1);
  const id = params.postId ?? generatePostId();
  const pk = postPk(id);
  const createdAt = parseDiscordTimestamp(
    params.thread.thread_metadata?.create_timestamp ?? starter.timestamp,
  );
  const now = Date.now();
  const starterAuthor = resolveDiscordAuthor(starter.author, {
    userMap: params.userMap,
    usernameToUserId: params.usernameToUserId,
  });
  const status = params.kind === 'bug' ? 'open' : 'open';

  let lastStaffCommentAt: number | undefined;
  let lastAuthorCommentAt: number | undefined;

  const comments: PlannedDiscordComment[] = [];
  for (const message of replies) {
    const author = resolveDiscordAuthor(message.author, {
      userMap: params.userMap,
      usernameToUserId: params.usernameToUserId,
    });
    const commentCreatedAt = parseDiscordTimestamp(message.timestamp);
    const commentId = generateCommentId();
    const isStaff = isStaffDiscordUser(message.author, params.staffBotUserIds);
    if (isStaff) {
      lastStaffCommentAt = commentCreatedAt;
    } else if (author.authorId === starterAuthor.authorId) {
      lastAuthorCommentAt = commentCreatedAt;
    }
    comments.push({
      pk,
      sk: commentSk(commentCreatedAt, commentId),
      entityType: 'comment',
      commentId,
      authorId: author.authorId,
      authorName: author.authorName,
      body: formatDiscordMessageBody(message.content, message.attachments),
      createdAt: commentCreatedAt,
      ...(isStaff ? { isStaff: true } : {}),
      legacyDiscordMessageId: message.id,
      legacyDiscordUserId: author.legacyDiscordUserId,
      legacyDiscordUsername: author.legacyDiscordUsername,
    });
  }

  const meta: FeedbackMetaItem = {
    pk,
    sk: metaSk(),
    entityType: 'meta',
    id,
    kind: params.kind,
    title: params.thread.name.trim() || 'Untitled thread',
    body: formatDiscordMessageBody(starter.content, starter.attachments),
    status,
    authorId: starterAuthor.authorId,
    authorName: starterAuthor.authorName,
    createdAt,
    updatedAt: comments.length > 0
      ? comments[comments.length - 1]!.createdAt
      : createdAt,
    voteCount: 0,
    legacyVoteCount: 0,
    effectiveVotes: 0,
    commentCount: comments.length,
    legacyDiscordThreadId: params.thread.id,
    legacyDiscordUserId: starterAuthor.legacyDiscordUserId,
    legacyDiscordUsername: starterAuthor.legacyDiscordUsername,
    ...(lastStaffCommentAt !== undefined ? { lastStaffCommentAt } : {}),
    ...(lastAuthorCommentAt !== undefined ? { lastAuthorCommentAt } : {}),
    gsi2pk: statusGsi2Pk(params.kind, status),
    gsi2sk: String(createdAt),
  };

  return {
    meta,
    comments,
    listRows: buildDiscordListRowsFromMeta(meta),
  };
}

export function discordThreadImportKey(threadId: string): string {
  return `discord:${threadId}`;
}
