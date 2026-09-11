import { v4 as uuidv4 } from 'uuid';

export function generatePostId(): string {
  return uuidv4();
}

export function generateCommentId(): string {
  return uuidv4();
}

export function generateEditId(): string {
  return uuidv4();
}

export function normalizeGameUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    url.hash = '';
    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return trimmed;
  }
}

const BGG_GAME_PATH = /boardgamegeek\.com\/boardgame\/(\d+)/i;

export function parseBggGameId(url: string): string | undefined {
  const match = url.match(BGG_GAME_PATH);
  return match?.[1];
}

/** Canonical URL for wishlist dedup (host lowercased, no hash, no trailing slash). */
export function normalizedGameUrlForDedup(url: string): string {
  try {
    const parsed = new URL(normalizeGameUrl(url));
    parsed.hostname = parsed.hostname.toLowerCase();
    let path = parsed.pathname;
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    return normalizeGameUrl(url).toLowerCase();
  }
}
