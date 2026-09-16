export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'retracted';
export type AnnouncementSource = 'ap' | 'import-discord';

export type AnnouncementRecord = {
  pk: 'ANNOUNCEMENT';
  sk: string;
  id: string;
  status: AnnouncementStatus;
  title: string;
  body: string;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
  source: AnnouncementSource;
  attachmentKeys?: string[];
  reactionCounts?: Record<string, number>;
  discordMessageId?: string;
  editedAt?: number;
  adminNote?: string;
};

export type AnnouncementPublicItem = {
  id: string;
  title: string;
  body: string;
  publishedAt: number;
  attachmentKeys?: string[];
  reactionCounts?: Record<string, number>;
};

export type AnnouncementsListPars = {
  limit?: number;
  cursor?: string;
};

export type AnnouncementGetPars = {
  id: string;
};
