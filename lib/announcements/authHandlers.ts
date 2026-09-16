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
type AnnouncementReactPars = { id: string; emoji: string };
type AnnouncementReactionsMinePars = { ids: string[] };

export async function announcementSaveAuth(userId: string, pars: AnnouncementSavePars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementSaveWithOptionalRss(ddbDocClient, tableName, s3Client, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to save announcement.');
  }
}

export async function announcementsAdminListAuth(userId: string, pars: AnnouncementsAdminListPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementsAdminList(ddbDocClient, tableName, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        items: result.data.items,
        nextCursor: result.data.nextCursor,
      }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to list announcements.');
  }
}

export async function announcementGetAuth(userId: string, pars: AnnouncementGetPars) {
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const id = pars?.id;
    const isAdmin = await isFeedbackAdmin(userId);
    if (isAdmin) {
      const result = await announcementGetAdmin(ddbDocClient, tableName, s3Client, id);
      if (!result.ok) {
        return feedbackErrorResponse(result.message, result.statusCode ?? 404);
      }
      return {
        statusCode: 200,
        body: JSON.stringify(result.data),
        headers,
      };
    }
    const result = await announcementGet(ddbDocClient, tableName, s3Client, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 404);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to load announcement.');
  }
}

export async function announcementPresignUploadAuth(userId: string, pars: AnnouncementPresignUploadPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementPresignUpload(s3Client, ddbDocClient, tableName, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to presign upload.');
  }
}

async function notifyAnnouncementPublishedUsers(record: { id: string; title: string }) {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    return;
  }
  const link = `${announcementsSiteUrl()}/news/${record.id}`;
  try {
    await fanOutAnnouncementPublished(ddbDocClient, tableName, async (user) => {
      const player = user as FullUser;
      await changeLanguageForPlayer({ language: player.language });
      const subject = i18n.t('AnnouncementSubject');
      const body = i18n.t('AnnouncementBody', { title: record.title, link });
      let emailed = false;
      let pushed = false;
      if (user.email) {
        const comm = createSendEmailCommand(user.email, user.name ?? user.id, subject, body);
        await sesClient.send(comm);
        emailed = true;
      }
      try {
        await sendUserPush({
          userId: user.id,
          topic: 'announcements',
          title: i18n.t('PUSH.titles.announcement'),
          body: record.title,
          url: `/news/${record.id}`,
        });
        pushed = true;
      } catch (pushErr) {
        logGetItemError(pushErr);
      }
      return { emailed, pushed };
    });
  } catch (error) {
    logGetItemError(error);
  }
}

export async function announcementPublishAuth(userId: string, pars: AnnouncementGetPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementPublish(ddbDocClient, tableName, s3Client, pars.id);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400, result.code);
    }
    await notifyAnnouncementPublishedUsers({
      id: result.data.id,
      title: result.data.title,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ id: result.data.id, publishedAt: result.data.publishedAt }),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to publish announcement.');
  }
}

export async function announcementRetractAuth(userId: string, pars: AnnouncementGetPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementRetract(ddbDocClient, tableName, s3Client, pars.id);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400, result.code);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to retract announcement.');
  }
}

export async function announcementsMarkReadAuth(userId: string, pars: AnnouncementsMarkReadPars) {
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementsMarkRead(ddbDocClient, tableName, userId, pars?.readAt);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to mark announcements read.');
  }
}

export async function announcementReactAuth(userId: string, pars: AnnouncementReactPars) {
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementReact(ddbDocClient, tableName, userId, pars.id, pars.emoji);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to update reaction.');
  }
}

export async function announcementReactionsMineAuth(userId: string, pars: AnnouncementReactionsMinePars) {
  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE;
    if (!tableName) {
      return feedbackErrorResponse('Announcements are not configured.', 500);
    }
    const result = await announcementReactionsMine(ddbDocClient, tableName, userId, pars?.ids ?? []);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to load reactions.');
  }
}
