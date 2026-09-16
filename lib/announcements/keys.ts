export const ANNOUNCEMENT_PK = 'ANNOUNCEMENT';
export const ANNOUNCEMENT_PUBLISHED_PK = 'ANNOUNCEMENT_PUBLISHED';

export function announcementSk(id: string): string {
  return id;
}

export function publishedIndexSk(publishedAtMs: number, id: string): string {
  return `${String(publishedAtMs).padStart(13, '0')}#${id}`;
}

/** Inclusive lower bound for publishedAt on ANNOUNCEMENT_PUBLISHED sort key. */
export function publishedIndexSkLowerBound(publishedAtMs: number): string {
  return `${String(publishedAtMs).padStart(13, '0')}#`;
}

/** Exclusive upper bound (items strictly older than publishedAtMs). */
export function publishedIndexSkUpperBoundExclusive(publishedAtMs: number): string {
  return `${String(publishedAtMs).padStart(13, '0')}#`;
}

export function importAttachmentPrefix(announcementId: string): string {
  return `import/${announcementId}/`;
}
