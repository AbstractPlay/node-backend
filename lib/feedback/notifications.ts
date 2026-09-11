import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createNotification } from '../notifications.js';
import { isBotId } from '../participants.js';
import type { FeedbackKind } from './types.js';
import { listSubscriberIds } from './subscribe.js';

const MAIN_TABLE = process.env.ABSTRACT_PLAY_TABLE;

async function notifyRecipients(
  client: DynamoDBDocumentClient,
  feedbackTable: string,
  recipients: string[],
  body: Parameters<typeof createNotification>[3],
): Promise<void> {
  if (!MAIN_TABLE) {
    return;
  }
  const unique = [...new Set(recipients)].filter((id) => id);
  for (const userId of unique) {
    if (await isBotId(userId)) {
      continue;
    }
    await createNotification(client, MAIN_TABLE, userId, body);
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
