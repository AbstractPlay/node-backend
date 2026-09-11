import { XMLParser } from 'fast-xml-parser';
import {
  FEEDBACK_ALLOWED_ATTACHMENT_TYPES,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
} from './constants.js';

const BGG_THING_API_BASE = 'https://boardgamegeek.com/xmlapi2/thing';
const BGG_REQUEST_MAX_ATTEMPTS = 6;
const BGG_REQUEST_RETRY_MS = 2000;
const BGG_USER_AGENT = 'AbstractPlay/1.0 (wishlist cover backfill; contact: support@abstractplay.com)';

export function bggApiToken(): string {
  const token = process.env.BGG_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'BGG_API_TOKEN is required for BGG API requests (same application token as gameslib/bin/fetchThumbs.ts).',
    );
  }
  return token;
}

export function bggApiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${bggApiToken()}`,
    Accept: 'application/xml,text/xml,*/*',
    'User-Agent': BGG_USER_AGENT,
  };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.startsWith('http') ? trimmed : undefined;
}

export async function fetchBggRepresentativeImageUrl(bggGameId: string): Promise<string | undefined> {
  const id = bggGameId.trim();
  if (!/^\d+$/.test(id)) {
    return undefined;
  }

  const url = `${BGG_THING_API_BASE}?id=${encodeURIComponent(id)}`;
  let xml = '';
  for (let attempt = 0; attempt < BGG_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      headers: bggApiHeaders(),
    });
    if (response.status === 202) {
      await sleep(BGG_REQUEST_RETRY_MS);
      continue;
    }
    if (!response.ok) {
      throw new Error(`BGG thing API returned ${response.status} for game ${id}`);
    }
    xml = await response.text();
    break;
  }
  if (!xml) {
    throw new Error(`BGG thing API did not return data for game ${id}`);
  }

  const parsed = xmlParser.parse(xml) as {
    items?: { item?: { image?: unknown; thumbnail?: unknown } | Array<{ image?: unknown; thumbnail?: unknown }> };
  };
  const rawItem = parsed.items?.item;
  const item = Array.isArray(rawItem) ? rawItem[0] : rawItem;
  if (!item) {
    return undefined;
  }
  return normalizeImageUrl(item.image) ?? normalizeImageUrl(item.thumbnail);
}

export function contentTypeFromImageUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) {
    return 'image/png';
  }
  if (lower.includes('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

export function assertAllowedDownloadedImage(
  contentType: string,
  byteLength: number,
): { ok: true } | { ok: false; message: string } {
  if (!FEEDBACK_ALLOWED_ATTACHMENT_TYPES.includes(contentType as typeof FEEDBACK_ALLOWED_ATTACHMENT_TYPES[number])) {
    return { ok: false, message: `unsupported image content type: ${contentType}` };
  }
  if (byteLength > FEEDBACK_ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: 'downloaded image exceeds attachment size limit.' };
  }
  return { ok: true };
}
