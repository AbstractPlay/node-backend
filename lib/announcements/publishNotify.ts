import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  loadAnnouncementNotifyUsers,
  type AnnouncementNotifyUser,
} from './announcementNotifyIndex.js';

export type { AnnouncementNotifyUser } from './announcementNotifyIndex.js';
export { userWantsAnnouncementNotifications } from './announcementNotifyIndex.js';

export type AnnouncementFanOutResult = {
  optedIn: number;
  emailed: number;
  pushed: number;
};

/**
 * Notifies users on the ANNOUNCEMENT_NOTIFY index (maintained on settings save).
 */
export async function fanOutAnnouncementPublished(
  client: DynamoDBDocumentClient,
  tableName: string,
  notifyUser: (user: AnnouncementNotifyUser) => Promise<{ emailed?: boolean; pushed?: boolean }>,
): Promise<AnnouncementFanOutResult> {
  const users = await loadAnnouncementNotifyUsers(client, tableName);
  let emailed = 0;
  let pushed = 0;
  for (const user of users) {
    const result = await notifyUser(user);
    if (result.emailed) {
      emailed += 1;
    }
    if (result.pushed) {
      pushed += 1;
    }
  }
  return { optedIn: users.length, emailed, pushed };
}
