import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESClient } from '@aws-sdk/client-ses';
import { createSendEmailCommand } from '@backend/lib/createSendEmailCommand.js';
import { sendOutboundSes } from '@backend/lib/sesOutbound.js';
import i18n from 'i18next';
import { localizedGameName } from '@backend/lib/gameDisplayName.js';
import { isBotId, isValidUserId } from './inactiveChallengeDiscovery.js';
import {
  wantsInAppNotification,
  type InAppNotificationUserSettings,
} from './inAppNotificationPrefs.js';
import { sendPush } from './pushSubscriptions.js';
import type { ChallengePlayer, RevokeChallengeRecord } from './revokeChallenge.js';

const NOTIFICATION_PK_PREFIX = 'NOTIFICATION#';
const NOTIFICATION_INITIAL_TTL_DAYS = 180;
const SEC_PER_DAY = 86_400;

type NotificationUser = {
  id: string;
  name: string;
  email?: string;
  language?: string;
  settings?: InAppNotificationUserSettings;
};

function notificationPk(userId: string): string {
  return `${NOTIFICATION_PK_PREFIX}${userId}`;
}

function notificationInitialExpiresAt(now = Date.now()): number {
  return Math.floor(now / 1000) + NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY;
}

function uniqueSortKey(now = Date.now()): string {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}

function wantsChallengeEmail(settings: InAppNotificationUserSettings | undefined): boolean {
  const notifications = settings?.all?.notifications as { challenges?: boolean } | undefined;
  return notifications === undefined || notifications.challenges !== false;
}

async function loadNotificationUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<NotificationUser | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'id, #name, email, #language, settings',
    ExpressionAttributeNames: { '#name': 'name', '#language': 'language' },
  }));
  if (data.Item === undefined) {
    return undefined;
  }
  const item = data.Item;
  return {
    id: String(item.id ?? userId),
    name: String(item.name ?? userId),
    email: typeof item.email === 'string' ? item.email : undefined,
    language: typeof item.language === 'string' ? item.language : undefined,
    settings: item.settings as InAppNotificationUserSettings | undefined,
  };
}

async function changeLanguageForPlayer(player: NotificationUser): Promise<void> {
  const lng = player.language ?? 'en';
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
}

async function createChallengeRevokedNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  body: {
    type: 'challengeRevoked';
    challengeId: string;
    metaGame: string;
    revokerId: string;
    revokerName: string;
  },
  userSettings?: InAppNotificationUserSettings,
): Promise<void> {
  if (!wantsInAppNotification(userSettings, 'challenges')) {
    return;
  }
  const now = Date.now();
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: notificationPk(userId),
      sk: uniqueSortKey(now),
      body,
      expiresAt: notificationInitialExpiresAt(now),
    },
  }));
}

export async function notifyChallengeRevokedAcceptors(
  client: DynamoDBDocumentClient,
  tableName: string,
  sesClient: SESClient,
  challenge: RevokeChallengeRecord,
  standing: boolean,
): Promise<void> {
  const acceptors = (challenge.players ?? []).filter(
    p => isValidUserId(p.id) && p.id !== challenge.challenger.id,
  );
  if (acceptors.length === 0) {
    return;
  }

  const revokerName = challenge.challenger.name ?? challenge.challenger.id;

  for (const acceptor of acceptors) {
    if (await isBotId(client, tableName, acceptor.id)) {
      continue;
    }
    const player = await loadNotificationUser(client, tableName, acceptor.id);
    if (player === undefined) {
      continue;
    }
    await changeLanguageForPlayer(player);
    const localizedBody = i18n.t('ChallengeRevokedBody', {
      name: revokerName,
      metaGame: localizedGameName(challenge.metaGame),
    });

    if (player.email !== undefined && player.email !== '' && wantsChallengeEmail(player.settings)) {
      await sendOutboundSes(sesClient, createSendEmailCommand(
        player.email,
        player.name,
        i18n.t('ChallengeRevokedSubject'),
        localizedBody,
        { userId: player.id },
      ));
    }

    await sendPush(client, tableName, {
      userId: player.id,
      topic: 'challenges',
      title: i18n.t('PUSH.titles.revoked'),
      body: localizedBody,
      url: '/',
    });

    if (!standing) {
      await createChallengeRevokedNotification(client, tableName, player.id, {
        type: 'challengeRevoked',
        challengeId: challenge.id,
        metaGame: challenge.metaGame,
        revokerId: challenge.challenger.id,
        revokerName,
      }, player.settings);
    }
  }
}

export function toRevokeChallengeRecord(
  challenge: Record<string, unknown>,
): RevokeChallengeRecord | undefined {
  const id = typeof challenge.id === 'string' ? challenge.id : undefined;
  const metaGame = typeof challenge.metaGame === 'string' ? challenge.metaGame : undefined;
  const numPlayers = typeof challenge.numPlayers === 'number' ? challenge.numPlayers : undefined;
  const challenger = challenge.challenger as ChallengePlayer | undefined;
  if (
    id === undefined
    || metaGame === undefined
    || numPlayers === undefined
    || challenger === undefined
    || typeof challenger.id !== 'string'
  ) {
    return undefined;
  }
  const hasStartPosition = challenge.hasStartPosition === true ? true : undefined;
  return {
    id,
    metaGame,
    numPlayers,
    challenger,
    challengees: challenge.challengees as ChallengePlayer[] | undefined,
    players: challenge.players as ChallengePlayer[] | undefined,
    ...(hasStartPosition ? { hasStartPosition: true } : {}),
  };
}
