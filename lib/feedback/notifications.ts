import {
  GetCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { createNotification, type CreateNotificationOptions } from '../notifications.js';
import { isBotIdOnTable } from '../participants.js';
import type { FeedbackKind } from './types.js';
import { FEEDBACK_NEW_POST_NOTIFY_USER_IDS } from './constants.js';
import { listSubscriberIds } from './subscribe.js';
import {
  listFeedbackNewNotifyUserIds,
  wantsFeedbackNewKindFromSettings,
} from './feedbackNewNotifyIndex.js';

function getMainTableName(): string | undefined {
  return process.env.ABSTRACT_PLAY_TABLE;
}

const FEEDBACK_NEW_ADMIN_IDS = new Set<string>(FEEDBACK_NEW_POST_NOTIFY_USER_IDS);

async function loadUserSettings(
  client: DynamoDBDocumentClient,
  mainTable: string,
  userId: string,
): Promise<unknown> {
  const result = await client.send(new GetCommand({
    TableName: mainTable,
    Key: { pk: 'USER', sk: userId },
  }));
  return result.Item?.settings;
}

async function notifyRecipients(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  recipients: string[],
  body: Parameters<typeof createNotification>[3],
  options?: CreateNotificationOptions,
): Promise<void> {
  const mainTable = getMainTableName();
  if (!mainTable) {
    return;
  }
  const unique = [...new Set(recipients)].filter((id) => id);
  for (const userId of unique) {
    if (await isBotIdOnTable(client, mainTable, userId)) {
      continue;
    }
    await createNotification(client, mainTable, userId, body, options);
  }
}

export async function notifyFeedbackNewPost(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  pars: {
    postId: string;
    kind: FeedbackKind;
    title: string;
    authorId: string;
  },
): Promise<void> {
  const mainTable = getMainTableName();
  if (!mainTable) {
    return;
  }

  const body = {
    type: 'feedbackNew' as const,
    postId: pars.postId,
    kind: pars.kind,
    title: pars.title,
  };

  const adminRecipients = FEEDBACK_NEW_POST_NOTIFY_USER_IDS.filter(
    (userId) => userId && userId !== pars.authorId,
  );
  await notifyRecipients(client, feedbackTable, adminRecipients, body, {
    bypassInAppPreference: true,
  });

  const optInIds = (await listFeedbackNewNotifyUserIds(client, feedbackTable, pars.kind))
    .filter((userId) => userId && userId !== pars.authorId && !FEEDBACK_NEW_ADMIN_IDS.has(userId));

  const settingsByUserId = new Map<string, unknown>();
  for (const userId of optInIds) {
    settingsByUserId.set(userId, await loadUserSettings(client, mainTable, userId));
  }

  const confirmedOptIn = optInIds.filter((userId) => (
    wantsFeedbackNewKindFromSettings(settingsByUserId.get(userId), pars.kind)
  ));

  await notifyRecipients(client, feedbackTable, confirmedOptIn, body, {
    bypassInAppPreference: true,
  });
}

export async function notifyFeedbackComment(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  pars: {
    postId: string;
    kind: FeedbackKind;
    title: string;
    authorId: string;
    commenterId: string;
    commentPreview: string;
  },
): Promise<void> {
  const subscribers = await listSubscriberIds(client, feedbackTable, pars.postId);
  const recipients = new Set<string>(subscribers);
  if (pars.authorId !== pars.commenterId) {
    recipients.add(pars.authorId);
  }
  recipients.delete(pars.commenterId);

  const preview = pars.commentPreview.length > 120
    ? `${pars.commentPreview.slice(0, 117)}...`
    : pars.commentPreview;

  await notifyRecipients(client, feedbackTable, [...recipients], {
    type: 'feedbackReply',
    postId: pars.postId,
    kind: pars.kind,
    title: pars.title,
    commentPreview: preview,
  });
}

export async function notifyFeedbackStatusChange(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  pars: {
    postId: string;
    kind: FeedbackKind;
    title: string;
    authorId: string;
    status: string;
    actorId: string;
  },
): Promise<void> {
  const subscribers = await listSubscriberIds(client, feedbackTable, pars.postId);
  const recipients = new Set<string>(subscribers);
  recipients.add(pars.authorId);
  recipients.delete(pars.actorId);

  await notifyRecipients(client, feedbackTable, [...recipients], {
    type: 'feedbackStatus',
    postId: pars.postId,
    kind: pars.kind,
    title: pars.title,
    status: pars.status,
  });
}

export async function notifyFeedbackReviewRequested(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  pars: {
    postId: string;
    kind: FeedbackKind;
    title: string;
    reviewerIds: string[];
    actorId: string;
  },
): Promise<void> {
  const recipients = pars.reviewerIds.filter((id) => id && id !== pars.actorId);
  await notifyRecipients(client, feedbackTable, recipients, {
    type: 'feedbackReviewRequested',
    postId: pars.postId,
    kind: pars.kind,
    title: pars.title,
  });
}

export async function notifyFeedbackDeleted(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  pars: {
    kind: FeedbackKind;
    title: string;
    authorId: string;
    reason: string;
    actorId: string;
    subscriberIds: string[];
  },
): Promise<void> {
  const recipients = new Set<string>(pars.subscriberIds);
  recipients.add(pars.authorId);
  recipients.delete(pars.actorId);

  const reason = pars.reason.length > 200
    ? `${pars.reason.slice(0, 197)}...`
    : pars.reason;

  await notifyRecipients(client, feedbackTable, [...recipients], {
    type: 'feedbackDeleted',
    kind: pars.kind,
    title: pars.title,
    reason,
  });
}
