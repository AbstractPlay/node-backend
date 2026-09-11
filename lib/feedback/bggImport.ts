import { XMLParser } from 'fast-xml-parser';
import {
  generatePostId,
  normalizeGameUrl,
  normalizedGameUrlForDedup,
} from './ids.js';
import type { FeedbackMetaItem } from './types.js';
import {
  kindGsi1Pk,
  listGsi1SkForSort,
  listSkForSort,
  metaSk,
  postPk,
  statusGsi2Pk,
  subscribeSk,
  USER_PK_PREFIX,
  userIndexSk,
  voteSk,
} from './keys.js';

export type BggWishlistXmlItem = {
  '@_objectname'?: string;
  '@_objectid'?: string;
  '@_id'?: string;
  '@_username'?: string;
  '@_postdate'?: string;
  '@_thumbs'?: string;
  body?: string | { '#text'?: string };
};

export type ParsedBggWishlistItem = {
  legacyBggItemId: string;
  title: string;
  bggGameId: string;
  gameUrl: string;
  normalizedGameUrl: string;
  legacyVoteCount: number;
  legacyBggSubmitter?: string;
  body?: string;
  createdAt: number;
};

export const BGG_IMPORT_AUTHOR_ID = '00000000-0000-4000-8000-000000000001';
const IMPORT_AUTHOR_NAME = 'BGG Import';

/** BGG @usernames that should not receive import-time auto-vote or auto-subscribe. */
export const BGG_IMPORT_SKIP_AUTO_ENGAGE_SUBMITTERS = new Set(['striton']);

export type ApUsernameIndex = {
  exactNameToId: Map<string, string>;
  lowerToEntries: Map<string, { id: string; name: string }[]>;
};

export type BggAuthorResolver = {
  userMap: Record<string, string>;
  apUsers?: ApUsernameIndex;
  displayNameByUserId?: Record<string, string>;
};

export type ResolvedBggAuthor = {
  authorId: string;
  authorName: string;
  legacyBggSubmitter?: string;
};

export function buildApUsernameIndexFromRows(
  rows: { id: string; name: string }[],
): ApUsernameIndex {
  const exactNameToId = new Map<string, string>();
  const lowerToEntries = new Map<string, { id: string; name: string }[]>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    exactNameToId.set(name, row.id);
    const key = name.toLowerCase();
    const entries = lowerToEntries.get(key) ?? [];
    entries.push({ id: row.id, name });
    lowerToEntries.set(key, entries);
  }
  return { exactNameToId, lowerToEntries };
}

function lookupUserMap(userMap: Record<string, string>, bggUsername: string): string | undefined {
  if (userMap[bggUsername]) {
    return userMap[bggUsername];
  }
  const lower = bggUsername.toLowerCase();
  for (const [key, value] of Object.entries(userMap)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

export function resolveBggSubmitter(
  bggUsername: string | undefined,
  resolver: BggAuthorResolver,
): ResolvedBggAuthor {
  const legacyBggSubmitter = bggUsername?.trim() || undefined;
  if (!legacyBggSubmitter) {
    return {
      authorId: BGG_IMPORT_AUTHOR_ID,
      authorName: IMPORT_AUTHOR_NAME,
    };
  }

  const mappedId = lookupUserMap(resolver.userMap, legacyBggSubmitter);
  if (mappedId) {
    return {
      authorId: mappedId,
      authorName: resolver.displayNameByUserId?.[mappedId] ?? legacyBggSubmitter,
      legacyBggSubmitter,
    };
  }

  const index = resolver.apUsers;
  if (index) {
    const exactId = index.exactNameToId.get(legacyBggSubmitter);
    if (exactId) {
      return {
        authorId: exactId,
        authorName: resolver.displayNameByUserId?.[exactId]
          ?? index.lowerToEntries.get(legacyBggSubmitter.toLowerCase())?.find((e) => e.id === exactId)?.name
          ?? legacyBggSubmitter,
        legacyBggSubmitter,
      };
    }
    const candidates = index.lowerToEntries.get(legacyBggSubmitter.toLowerCase()) ?? [];
    if (candidates.length === 1) {
      const match = candidates[0]!;
      return {
        authorId: match.id,
        authorName: match.name,
        legacyBggSubmitter,
      };
    }
  }

  return {
    authorId: BGG_IMPORT_AUTHOR_ID,
    authorName: IMPORT_AUTHOR_NAME,
    legacyBggSubmitter,
  };
}

export function shouldBggImportAutoEngageAuthor(
  legacyBggSubmitter?: string,
  authorId?: string,
): boolean {
  const submitter = legacyBggSubmitter?.trim();
  if (!submitter) {
    return false;
  }
  if (BGG_IMPORT_SKIP_AUTO_ENGAGE_SUBMITTERS.has(submitter.toLowerCase())) {
    return false;
  }
  if (!authorId || authorId === BGG_IMPORT_AUTHOR_ID) {
    return false;
  }
  return true;
}

export function parseBggWishlistXml(xml: string): ParsedBggWishlistItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
  });
  const parsed = parser.parse(xml) as { geeklist?: { item?: BggWishlistXmlItem | BggWishlistXmlItem[] } };
  const rawItems = parsed.geeklist?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const results: ParsedBggWishlistItem[] = [];
  for (const item of items) {
    const legacyBggItemId = item['@_id']?.trim();
    const title = item['@_objectname']?.trim();
    const bggGameId = item['@_objectid']?.trim();
    if (!legacyBggItemId || !title || !bggGameId) {
      continue;
    }
    const gameUrl = normalizeGameUrl(`https://boardgamegeek.com/boardgame/${bggGameId}`);
    const legacyVoteCount = Number.parseInt(item['@_thumbs'] ?? '0', 10);
    const createdAt = Date.parse(item['@_postdate'] ?? '') || Date.now();
    let body: string | undefined;
    if (typeof item.body === 'string') {
      body = item.body.trim() || undefined;
    } else if (item.body?.['#text']) {
      body = item.body['#text'].trim() || undefined;
    }
    const footer = item['@_username']
      ? `\n\n— Originally suggested on BGG by ${item['@_username']}.`
      : '\n\n— Imported from the former BGG wishlist.';
    results.push({
      legacyBggItemId,
      title,
      bggGameId,
      gameUrl,
      normalizedGameUrl: normalizedGameUrlForDedup(gameUrl),
      legacyVoteCount: Number.isFinite(legacyVoteCount) && legacyVoteCount >= 0 ? legacyVoteCount : 0,
      legacyBggSubmitter: item['@_username']?.trim(),
      body: body ? `${body}${footer}` : footer.trim(),
      createdAt,
    });
  }
  return results;
}

export function buildWishlistMetaFromBggImport(
  item: ParsedBggWishlistItem,
  id = generatePostId(),
  resolver?: BggAuthorResolver,
): FeedbackMetaItem {
  const now = Date.now();
  const author = resolveBggSubmitter(item.legacyBggSubmitter, resolver ?? { userMap: {} });
  const autoEngage = shouldBggImportAutoEngageAuthor(item.legacyBggSubmitter, author.authorId);
  const voteCount = autoEngage ? 1 : 0;
  const effectiveVotes = item.legacyVoteCount + voteCount;
  return {
    pk: postPk(id),
    sk: metaSk(),
    entityType: 'meta',
    id,
    kind: 'wishlist',
    title: item.title,
    body: item.body,
    status: 'requested',
    authorId: author.authorId,
    authorName: author.authorName,
    createdAt: item.createdAt,
    updatedAt: now,
    voteCount,
    legacyVoteCount: item.legacyVoteCount,
    effectiveVotes,
    commentCount: 0,
    gameUrl: item.gameUrl,
    bggGameId: item.bggGameId,
    normalizedGameUrl: item.normalizedGameUrl,
    legacyBggItemId: item.legacyBggItemId,
    legacyBggSubmitter: author.legacyBggSubmitter,
    wishlistCategory: 'none',
    gsi2pk: statusGsi2Pk('wishlist', 'requested'),
    gsi2sk: String(item.createdAt),
  };
}

export function buildBggImportAuthorEngagementRows(
  meta: FeedbackMetaItem,
  item: ParsedBggWishlistItem,
  resolver?: BggAuthorResolver,
): Record<string, unknown>[] {
  const author = resolveBggSubmitter(item.legacyBggSubmitter, resolver ?? { userMap: {} });
  if (!shouldBggImportAutoEngageAuthor(item.legacyBggSubmitter, author.authorId)) {
    return [];
  }
  const createdAt = meta.createdAt;
  return [
    {
      pk: postPk(meta.id),
      sk: subscribeSk(author.authorId),
      entityType: 'subscribe',
      userId: author.authorId,
      createdAt,
      source: 'comment',
    },
    {
      pk: postPk(meta.id),
      sk: voteSk(author.authorId),
      entityType: 'vote',
      userId: author.authorId,
      createdAt,
    },
    {
      pk: `${USER_PK_PREFIX}${author.authorId}`,
      sk: userIndexSk('wishlist', createdAt, meta.id),
      entityType: 'userIndex',
      id: meta.id,
      kind: 'wishlist',
      createdAt,
    },
  ];
}

export function buildWishlistListRowsFromMeta(meta: FeedbackMetaItem): Record<string, unknown>[] {
  return (['votes', 'recent', 'updated'] as const).map((sort) => ({
    ...meta,
    pk: meta.pk,
    sk: listSkForSort(sort),
    entityType: 'list',
    gsi1pk: kindGsi1Pk('wishlist'),
    gsi1sk: listGsi1SkForSort(sort, meta.effectiveVotes, meta.createdAt, meta.updatedAt, meta.id),
  }));
}

export function bggImportItemKey(item: ParsedBggWishlistItem): string {
  return `bgg:${item.legacyBggItemId}`;
}
