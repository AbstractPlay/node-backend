import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createNotification } from '../notifications.js';
import { isBotIdOnTable } from '../participants.js';
import type { FeedbackKind } from './types.js';
import { listSubscriberIds } from './subscribe.js';

function getMainTableName(): string | undefined {
  return process.env.ABSTRACT_PLAY_TABLE;
}

async function notifyRecipients(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  recipients: string[],
  body: Parameters<typeof createNotification>[3],
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
    await createNotification(client, mainTable, userId, body);
  }
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
