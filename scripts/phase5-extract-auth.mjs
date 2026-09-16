/**
 * Extract Phase 5 auth glue handlers from abstractplay.ts into lib modules.
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'api/abstractplay.ts');
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function writeRel(relPath, header, body) {
  const outPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${header}\n${body}\n`, 'utf8');
  console.log('wrote', relPath);
}

const playgroundHeader = `import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import {
  deletePlaygroundSave,
  getPlaygroundSave,
  listPlaygroundSaves,
  putPlaygroundSave,
  validatePlaygroundSaveInput,
  type PlaygroundSaveInput,
} from '../playgroundSaves.js';
`;

writeRel(
  'lib/playground/authHandlers.ts',
  playgroundHeader,
  [
    slice(656, 672).replace(/^async function listPlaygroundSavesAuth/, 'export async function listPlaygroundSavesAuth'),
    slice(674, 701).replace(/^async function getPlaygroundSaveAuth/, 'export async function getPlaygroundSaveAuth'),
    slice(703, 726).replace(/^async function createPlaygroundSaveAuth/, 'export async function createPlaygroundSaveAuth'),
    slice(728, 766).replace(/^async function savePlaygroundSaveAuth/, 'export async function savePlaygroundSaveAuth'),
    slice(768, 800).replace(/^async function deletePlaygroundSaveAuth/, 'export async function deletePlaygroundSaveAuth'),
  ].join('\n\n'),
);

const announcementsHeader = `import { GetCommand } from '@aws-sdk/lib-dynamodb';
import i18n from '../i18nInstance.js';
import { ddbDocClient } from '../ddb.js';
import { sesClient, s3Client } from '../api/clients.js';
import { headers } from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import { changeLanguageForPlayer, createSendEmailCommand } from '../api/i18n.js';
import { logGetItemError } from '../api/http.js';
import { sendUserPush } from '../push/sendUserPush.js';
import { announcementsSiteUrl } from './siteUrl.js';
import { fanOutAnnouncementPublished } from './publishNotify.js';
import {
  announcementGet,
  announcementGetAdmin,
  announcementPresignUpload,
  announcementPublish,
  announcementReact,
  announcementReactionsMine,
  announcementRetract,
  announcementSaveWithOptionalRss,
  announcementsAdminList,
  announcementsMarkRead,
  type AnnouncementGetPars,
  type AnnouncementPresignUploadPars,
  type AnnouncementReactPars,
  type AnnouncementReactionsMinePars,
  type AnnouncementSavePars,
  type AnnouncementsAdminListPars,
} from './index.js';
import { isFeedbackAdmin } from '../feedback/isFeedbackAdmin.js';

type FullUser = {
  id: string;
  name?: string;
  email?: string;
  language?: string;
};

type AnnouncementsMarkReadPars = { readAt?: number };
`;

const announcementBody = slice(813, 1077)
  .replace(/^async function announcementSaveAuth/, 'export async function announcementSaveAuth')
  .replace(/^async function announcementsAdminListAuth/, 'export async function announcementsAdminListAuth')
  .replace(/^async function announcementGetAuth/, 'export async function announcementGetAuth')
  .replace(/^async function announcementPresignUploadAuth/, 'export async function announcementPresignUploadAuth')
  .replace(/^async function notifyAnnouncementPublishedUsers/, 'async function notifyAnnouncementPublishedUsers')
  .replace(/await sendPush\(/g, 'await sendUserPush(')
  .replace(/^async function announcementPublishAuth/, 'export async function announcementPublishAuth')
  .replace(/^async function announcementRetractAuth/, 'export async function announcementRetractAuth')
  .replace(/^type AnnouncementsMarkReadPars[\s\S]*?^type AnnouncementReactionsMinePars[^\n]*\n\n/, '')
  .replace(/^async function announcementsMarkReadAuth/, 'export async function announcementsMarkReadAuth')
  .replace(/^async function announcementReactAuth/, 'export async function announcementReactAuth')
  .replace(/^async function announcementReactionsMineAuth/, 'export async function announcementReactionsMineAuth');

writeRel('lib/announcements/authHandlers.ts', announcementsHeader, announcementBody);

const feedbackHeader = `import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { s3Client } from '../api/clients.js';
import { headers } from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import { logGetItemError } from '../api/http.js';
import { isFeedbackAdmin } from './isFeedbackAdmin.js';
import {
  feedbackAdminList,
  feedbackComment,
  feedbackCreate,
  feedbackDelete,
  feedbackGet,
  feedbackHoldRetention,
  feedbackMerge,
  feedbackMine,
  feedbackPresignUpload,
  feedbackReclassify,
  feedbackSetAdminFields,
  feedbackSetStatus,
  feedbackSubscribe,
  feedbackUpdate,
  feedbackVote,
  type FeedbackAdminListPars,
  type FeedbackCommentPars,
  type FeedbackCreatePars,
  type FeedbackDeletePars,
  type FeedbackGetPars,
  type FeedbackHoldRetentionPars,
  type FeedbackMergePars,
  type FeedbackMinePars,
  type FeedbackPresignUploadPars,
  type FeedbackReclassifyPars,
  type FeedbackSetAdminFieldsPars,
  type FeedbackSetStatusPars,
  type FeedbackSubscribePars,
  type FeedbackUpdatePars,
  type FeedbackVotePars,
} from './index.js';
`;

let feedbackBody = slice(1080, 1397)
  .replace(/^async function feedbackHoldRetentionAuth/, 'export async function feedbackHoldRetentionAuth')
  .replace(/^async function feedbackGetAuth/, 'export async function feedbackGetAuth')
  .replace(/^async function feedbackPresignUploadAuth/, 'export async function feedbackPresignUploadAuth')
  .replace(/^async function feedbackSubscribeAuth/, 'export async function feedbackSubscribeAuth')
  .replace(/^async function isFeedbackAdmin[\s\S]*?^}\n\nasync function feedbackSetStatusAuth/, 'export async function feedbackSetStatusAuth');

writeRel('lib/feedback/isFeedbackAdmin.ts', `import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
`, slice(1154, 1160).replace(/^async function isFeedbackAdmin/, 'export async function isFeedbackAdmin'));

writeRel('lib/feedback/authHandlers.ts', feedbackHeader, feedbackBody);

const analyticsHeader = `import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { logRecommendationEvent, type RecommendationEventPars } from '../recommendationEvents.js';
import { logLayoutEvent, type LayoutEventPars } from '../layoutEvents.js';
`;

writeRel(
  'lib/analytics/authHandlers.ts',
  analyticsHeader,
  [
    slice(1399, 1419).replace(/^async function logRecommendationEventAuth/, 'export async function logRecommendationEventAuth'),
    slice(1421, 1441).replace(/^async function logLayoutEventAuth/, 'export async function logLayoutEventAuth'),
  ].join('\n\n'),
);

const marksHeader = `import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import {
  highlightGame,
  listHighlights,
  listUserRecommendations,
  listWatchedGames,
  recommendGame,
  type MarkResult,
  unhighlightGame,
  unrecommendGame,
  unwatchGame,
  watchGame,
} from '../playerGameMarks.js';

export type GameMarkPars = { metaGame: string; id: string };

function markResultResponse(result: MarkResult, successBody?: unknown) {
  if (!result.ok) {
    return formatReturnError(result.message);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(successBody ?? { message: 'Success' }),
    headers,
  };
}

function parseGameMarkPars(pars: GameMarkPars): GameMarkPars | undefined {
  if (!pars?.metaGame || !pars?.id) {
    return undefined;
  }
  return { metaGame: pars.metaGame, id: pars.id };
}
`;

writeRel(
  'lib/playerGameMarks/authHandlers.ts',
  marksHeader,
  [
    slice(1450, 1472).replace(/^async function watchGameAuth/, 'export async function watchGameAuth'),
    slice(1474, 1495).replace(/^async function unwatchGameAuth/, 'export async function unwatchGameAuth'),
    slice(1497, 1519).replace(/^async function highlightGameAuth/, 'export async function highlightGameAuth'),
    slice(1521, 1543).replace(/^async function unhighlightGameAuth/, 'export async function unhighlightGameAuth'),
    slice(1545, 1567).replace(/^async function recommendGameAuth/, 'export async function recommendGameAuth'),
    slice(1569, 1591).replace(/^async function unrecommendGameAuth/, 'export async function unrecommendGameAuth'),
  ].join('\n\n'),
);

const notificationsHeader = `import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import {
  dismissAllNotifications,
  dismissNotification as deleteUserNotification,
  loadNotificationsForDashboard,
  markNotificationsSeen,
} from '../notifications.js';
`;

writeRel(
  'lib/notifications/authHandlers.ts',
  notificationsHeader,
  [
    slice(1765, 1785).replace(/^async function dismissNotificationAuth/, 'export async function dismissNotificationAuth'),
    slice(1787, 1800).replace(/^async function dismissAllNotificationsAuth/, 'export async function dismissAllNotificationsAuth'),
    slice(1802, 1820).replace(/^async function listNotificationsAuth/, 'export async function listNotificationsAuth'),
    slice(1822, 1840).replace(/^async function markNotificationsSeenAuth/, 'export async function markNotificationsSeenAuth'),
  ].join('\n\n'),
);

console.log('Phase 5 extract done — review generated files.');
