import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { sesClient } from '../api/clients.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { getPlayers } from '../players/getPlayers.js';
import { createNotification } from '../notifications.js';
import { sendUserPush } from '../push/sendUserPush.js';
import { filterHumanIds } from '../participants.js';
import {
  buildEventEndEmailBody,
  buildEventEndPushBody,
  winnerDisplayNamesForNotification,
} from './eventEndMessage.js';

type OrgEventForNotify = {
  sk: string;
  name: string;
};

type OrgEventPlayerRow = {
  playerid: string;
};

function wantsEventEndEmail(settings: { all?: { notifications?: Record<string, boolean> } } | undefined): boolean {
  const notifications = settings?.all?.notifications;
  if (notifications === undefined) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(notifications, 'eventEnd')) {
    return true;
  }
  return notifications.eventEnd === true;
}

export async function notifyEventClosedParticipants(
  event: OrgEventForNotify,
  winnerIds: string[],
): Promise<void> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (tableName === undefined) {
    throw new Error('ABSTRACT_PLAY_TABLE is not configured');
  }

  const playersData = await ddbDocClient.send(new QueryCommand({
    TableName: tableName,
    ExpressionAttributeValues: { ':pk': 'ORGEVENTPLAYER', ':sk': event.sk },
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    KeyConditionExpression: '#pk = :pk and begins_with(#sk, :sk)',
  }));
  const playerRows = (playersData.Items ?? []) as OrgEventPlayerRow[];
  const participantIds = await filterHumanIds(playerRows.map(row => row.playerid));
  if (participantIds.length === 0) {
    return;
  }

  const playersFull = await getPlayers(participantIds);
  const playersById = new Map(playersFull.map(p => [p.id, p]));
  const winnerNamesAll = winnerDisplayNamesForNotification(winnerIds, playersById);
  const notificationWinnerNames = winnerNamesAll.length > 0 ? winnerNamesAll : undefined;

  await initi18n('en');

  const work: Promise<unknown>[] = [];
  for (const player of playersFull) {
    work.push((async () => {
      await createNotification(ddbDocClient, tableName, player.id, {
        type: 'eventEnd',
        eventId: event.sk,
        eventName: event.name,
        ...(notificationWinnerNames !== undefined ? { winnerNames: notificationWinnerNames } : {}),
      }, {
        userSettings: player.settings,
      });

      if (!wantsEventEndEmail(player.settings)) {
        return;
      }

      await changeLanguageForPlayer(player);
      const messageCtx = {
        eventName: event.name,
        eventId: event.sk,
        recipientUserId: player.id,
        winnerIds,
        winnerNames: winnerNamesAll,
      };
      const emailBody = buildEventEndEmailBody(messageCtx);
      const pushBody = buildEventEndPushBody(messageCtx);
      if (player.email !== undefined && player.email !== null && player.email !== '') {
        const comm = createSendEmailCommand(
          player.email,
          player.name,
          i18n.t('EventEndSubject', { eventName: event.name }),
          emailBody,
        );
        await sesClient.send(comm);
      }
      await sendUserPush({
        userId: player.id,
        topic: 'event',
        title: i18n.t('PUSH.titles.eventOver'),
        body: pushBody,
        url: `/event/${event.sk}`,
      });
    })());
  }

  await Promise.all(work);
}
