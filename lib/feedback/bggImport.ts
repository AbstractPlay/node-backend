import { XMLParser } from 'fast-xml-parser';
import {
  generatePostId,
  normalizeGameUrl,
  normalizedGameUrlForDedup,
} from './ids.js';
import type { FeedbackMetaItem } from './types.js';
import { kindGsi1Pk, listGsi1SkForSort, listSkForSort, metaSk, postPk, statusGsi2Pk } from './keys.js';

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

const IMPORT_AUTHOR_ID = '00000000-0000-4000-8000-000000000001';
const IMPORT_AUTHOR_NAME = 'BGG Import';

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

export function buildWishlistMetaFromBggImport(item: ParsedBggWishlistItem, id = generatePostId()): FeedbackMetaItem {
  const now = Date.now();
  const effectiveVotes = item.legacyVoteCount;
  return {
    pk: postPk(id),
    sk: metaSk(),
    entityType: 'meta',
    id,
    kind: 'wishlist',
    title: item.title,
    body: item.body,
    status: 'requested',
    authorId: IMPORT_AUTHOR_ID,
    authorName: IMPORT_AUTHOR_NAME,
    createdAt: item.createdAt,
    updatedAt: now,
    voteCount: 0,
    legacyVoteCount: item.legacyVoteCount,
    effectiveVotes,
    commentCount: 0,
    gameUrl: item.gameUrl,
    bggGameId: item.bggGameId,
    normalizedGameUrl: item.normalizedGameUrl,
    legacyBggItemId: item.legacyBggItemId,
    legacyBggSubmitter: item.legacyBggSubmitter,
    wishlistCategory: 'none',
    gsi2pk: statusGsi2Pk('wishlist', 'requested'),
    gsi2sk: String(item.createdAt),
  };
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
