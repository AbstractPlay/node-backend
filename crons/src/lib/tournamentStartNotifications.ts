import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  wantsInAppNotification,
  type InAppNotificationUserSettings,
} from './inAppNotificationPrefs.js';

const NOTIFICATION_PK_PREFIX = 'NOTIFICATION#';
const NOTIFICATION_INITIAL_TTL_DAYS = 180;
const SEC_PER_DAY = 86_400;

export type TournamentStartNotificationTournament = {
  id: string;
  metaGame: string;
  number: number;
  variants?: string[];
};

type TournamentStartNotificationBody = {
  type: 'tournamentStart';
  tournamentId: string;
  metaGame: string;
  number: number;
  variants: string[];
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

async function isBotId(
  client: DynamoDBDocumentClient,
  tableName: string,
  id: string,
): Promise<boolean> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'BOT', sk: id },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  return data.Item !== undefined;
}

async function filterHumanIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  ids: string[],
): Promise<string[]> {
  const human: string[] = [];
  for (const id of ids) {
    if (!(await isBotId(client, tableName, id))) {
      human.push(id);
    }
  }
  return human;
}

async function createTournamentStartNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  body: TournamentStartNotificationBody,
): Promise<void> {
  if (await isBotId(client, tableName, userId)) {
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

export async function enqueueTournamentStartNotifications(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournament: TournamentStartNotificationTournament,
  playerIds: string[],
  settingsByUserId?: ReadonlyMap<string, InAppNotificationUserSettings | undefined>,
): Promise<void> {
  const humanIds = await filterHumanIds(client, tableName, playerIds);
  const variants = tournament.variants ?? [];
  const bodyBase = {
    type: 'tournamentStart' as const,
    tournamentId: tournament.id,
    metaGame: tournament.metaGame,
    number: tournament.number,
    variants,
  };

  await Promise.all(humanIds.map(async (userId) => {
    const settings = settingsByUserId?.get(userId);
    if (!wantsInAppNotification(settings, 'tournamentStart')) {
      return;
    }
    await createTournamentStartNotification(client, tableName, userId, bodyBase);
  }));
}
