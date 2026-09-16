export const ANNOUNCEMENT_PK = 'ANNOUNCEMENT';
export const ANNOUNCEMENT_PUBLISHED_PK = 'ANNOUNCEMENT_PUBLISHED';

export function announcementSk(id: string): string {
  return id;
}

export function publishedIndexSk(publishedAtMs: number, id: string): string {
  return `${String(publishedAtMs).padStart(13, '0')}#${id}`;
}

export function importAttachmentPrefix(announcementId: string): string {
  return `import/${announcementId}/`;
}
