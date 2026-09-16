import type { AuthRouteHandler } from '../../../lib/api/routeTypes.js';
import {
  announcementGetAuth,
  announcementPresignUploadAuth,
  announcementPublishAuth,
  announcementReactAuth,
  announcementReactionsMineAuth,
  announcementRetractAuth,
  announcementSaveAuth,
  announcementsAdminListAuth,
  announcementsMarkReadAuth,
} from '../../../lib/announcements/authHandlers.js';
import { bindAuth } from './shared.js';

export const announcementsAuthRoutes: Record<string, AuthRouteHandler> = {
  announcement_save: bindAuth(announcementSaveAuth),
  announcements_admin_list: bindAuth(announcementsAdminListAuth),
  announcement_get: bindAuth(announcementGetAuth),
  announcement_presign_upload: bindAuth(announcementPresignUploadAuth),
  announcement_publish: bindAuth(announcementPublishAuth),
  announcement_retract: bindAuth(announcementRetractAuth),
  announcements_mark_read: bindAuth(announcementsMarkReadAuth),
  announcement_react: bindAuth(announcementReactAuth),
  announcement_reactions_mine: bindAuth(announcementReactionsMineAuth),
};
