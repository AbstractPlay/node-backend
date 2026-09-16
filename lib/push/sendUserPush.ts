import webpush from 'web-push';
import { formatReturnError, logGetItemError } from '../api/http.js';
import {
  type PushOptions,
  queryPushSubscriptions,
  sendPushToSubscriptions,
} from '../pushSubscriptions.js';

export async function sendUserPush(opts: PushOptions) {
  console.log(`Sending push: ${JSON.stringify(opts)}`);
  const { userId } = opts;
  let subscriptions;
  try {
    subscriptions = await queryPushSubscriptions(userId);
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fetch push credentials for ${userId}`);
  }

  await sendPushToSubscriptions(opts, subscriptions, webpush.sendNotification.bind(webpush), logGetItemError);
}
