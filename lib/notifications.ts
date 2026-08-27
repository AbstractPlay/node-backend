import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { isBotId, filterHumanIds } from './participants';

export const NOTIFICATION_PK_PREFIX = 'NOTIFICATION#';
export const NOTIFICATION_INITIAL_TTL_DAYS = 180;
export const NOTIFICATION_SEEN_TTL_DAYS = 7;

const SEC_PER_DAY = 86_400;

export const IN_APP_NOTIFICATION_CATEGORIES = [
  'challenges',
  'gameStart',
  'gameEnd',
  'ratingChange',
  'eventInvitation',
  'completedGameChat',
] as const;

export type InAppNotificationCategory = typeof IN_APP_NOTIFICATION_CATEGORIES[number];

export type InAppNotificationUserSettings = {
  all?: {
    inAppNotifications?: Partial<Record<InAppNotificationCategory, boolean>>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export type InAppSettingsByUserId = ReadonlyMap<
  string,
  InAppNotificationUserSettings | undefined
>;

export function inAppSettingsMapFromUsers(
  users: ReadonlyArray<{ id: string; settings?: unknown }>,
): Map<string, InAppNotificationUserSettings | undefined> {
  return new Map(users.map(u => [u.id, u.settings as InAppNotificationUserSettings | undefined]));
}

export function inAppCategoryForBody(body: NotificationBody): InAppNotificationCategory {
  switch (body.type) {
    case 'challengeIssued':
    case 'challengeDeclined':
    case 'challengeRevoked':
      return 'challenges';
    case 'gameStart':
      return 'gameStart';
    case 'gameEnd':
      return 'gameEnd';
    case 'ratingChange':
      return 'ratingChange';
    case 'eventInvitation':
      return 'eventInvitation';
    case 'completedGameChat':
      return 'completedGameChat';
    default: {
      const _exhaustive: never = body;
      return _exhaustive;
    }
  }
}

export function wantsInAppNotification(
  settings: InAppNotificationUserSettings | undefined,
  category: InAppNotificationCategory,
): boolean {
  const prefs = settings?.all?.inAppNotifications;
  if (prefs === undefined) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(prefs, category)) {
    return true;
  }
  return prefs[category] === true;
}

function userSettingsFromMap(
  settingsByUserId: InAppSettingsByUserId | undefined,
  userId: string,
): InAppNotificationUserSettings | undefined {
  return settingsByUserId?.get(userId);
}

export type NotificationBody =
  | {
    type: 'gameStart';
    gameId: string;
    metaGame: string;
    variants: string[];
    opponentId: string;
    opponentName: string;
  }
  | {
    type: 'gameEnd';
    gameId: string;
    metaGame: string;
    variants: string[];
    result: 'win' | 'lose' | 'draw';
  }
  | {
    type: 'ratingChange';
    metaGame: string;
    variants: string[];
    gameId?: string;
    oldRating: number;
    newRating: number;
    oldRd: number;
    newRd: number;
    oldProvisional: boolean;
    newProvisional: boolean;
    delta: number;
  }
  | {
    type: 'challengeIssued';
    challengeId: string;
    metaGame: string;
    challengerId: string;
    challengerName: string;
    note?: string;
  }
  | {
    type: 'challengeDeclined';
    challengeId: string;
    metaGame: string;
    declinerId: string;
    declinerName: string;
    note?: string;
  }
  | {
    type: 'challengeRevoked';
    challengeId: string;
    metaGame: string;
    revokerId: string;
    revokerName: string;
    note?: string;
  }
  | {
    type: 'eventInvitation';
    eventId: string;
    eventName: string;
    organizerId: string;
    organizerName: string;
  }
  | {
    type: 'completedGameChat';
    gameId: string;
    metaGame: string;
    variants: string[];
    commenterId: string;
    commenterName: string;
    backfill?: boolean;
  };

export type NotificationRecord = {
  pk: string;
  sk: string;
  body: NotificationBody;
  expiresAt: number;
};

export type ClientNotification = {
  sk: string;
  createdAt: number;
  body: NotificationBody;
};

export type NotificationGamePlayer = {
  id: string;
  name: string;
};

export type NotificationGame = {
  id: string;
  metaGame: string;
  variants?: string[];
  players: NotificationGamePlayer[];
  winner?: number[];
};

export function notificationPk(userId: string): string {
  return `${NOTIFICATION_PK_PREFIX}${userId}`;
}

export function notificationInitialExpiresAt(now = Date.now()): number {
  return Math.floor(now / 1000) + NOTIFICATION_INITIAL_TTL_DAYS * SEC_PER_DAY;
}

export function notificationSeenExpiresAt(now = Date.now()): number {
  return Math.floor(now / 1000) + NOTIFICATION_SEEN_TTL_DAYS * SEC_PER_DAY;
}

function uniqueSortKey(now = Date.now()): string {
  return `${now}#${Math.random().toString(36).slice(2, 10)}`;
}

export function parseNotificationCreatedAt(sk: string): number {
  const prefix = sk.split('#')[0];
  const createdAt = Number(prefix);
  if (!Number.isFinite(createdAt)) {
    return 0;
  }
  return createdAt;
}

function gameVariants(game: NotificationGame): string[] {
  return game.variants ?? [];
}

function opponentForPlayer(
  game: NotificationGame,
  playerId: string,
  humanPlayers: NotificationGamePlayer[],
): NotificationGamePlayer | undefined {
  const others = humanPlayers.filter(p => p.id !== playerId);
  return others[0];
}

function gameEndResult(
  game: NotificationGame,
  playerId: string,
): 'win' | 'lose' | 'draw' {
  const winners = game.winner ?? [];
  if (winners.length !== 1) {
    return 'draw';
  }
  const winnerIndex = winners[0] - 1;
  const winnerId = game.players[winnerIndex]?.id;
  if (winnerId === playerId) {
    return 'win';
  }
  return 'lose';
}

export type EventInvitationNotification = {
  eventId: string;
  eventName: string;
  organizerId: string;
  organizerName: string;
};

export function optionalNotificationNote(comment: string | undefined): string | undefined {
  const trimmed = comment?.trim();
  return trimmed || undefined;
}

export function buildNotificationItem(
  userId: string,
  body: NotificationBody,
  now = Date.now(),
): NotificationRecord {
  return {
    pk: notificationPk(userId),
    sk: uniqueSortKey(now),
    body,
    expiresAt: notificationInitialExpiresAt(now),
  };
}

export type CreateNotificationOptions = {
  userSettings?: InAppNotificationUserSettings;
};

export async function createNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  body: NotificationBody,
  options?: CreateNotificationOptions,
): Promise<void> {
  if (await isBotId(userId)) {
    return;
  }
  const category = inAppCategoryForBody(body);
  if (!wantsInAppNotification(options?.userSettings, category)) {
    return;
  }
  await putNotificationItem(client, tableName, userId, body);
}

/** Write in-app notification item (no bot filter; for admin backfill scripts). */
export async function putNotificationItem(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  body: NotificationBody,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: buildNotificationItem(userId, body),
  }));
}

export async function loadNotificationsForDashboard(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  options: { refreshExpiry: boolean },
): Promise<ClientNotification[]> {
  const pk = notificationPk(userId);
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const seenThresholdSec = notificationSeenExpiresAt(nowMs);
  const longTtlThresholdSec = nowSec + NOTIFICATION_SEEN_TTL_DAYS * SEC_PER_DAY;

  const items: NotificationRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
      ScanIndexForward: false,
    }));
    if (result.Items !== undefined) {
      items.push(...(result.Items as NotificationRecord[]));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  const survivors: ClientNotification[] = [];
  const work: Promise<unknown>[] = [];

  for (const item of items) {
    if (item.expiresAt <= nowSec) {
      work.push(client.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: item.pk, sk: item.sk },
      })));
      continue;
    }

    if (options.refreshExpiry && item.expiresAt > longTtlThresholdSec) {
      work.push(client.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'SET expiresAt = :exp',
        ExpressionAttributeValues: { ':exp': seenThresholdSec },
      })));
    }

    survivors.push({
      sk: item.sk,
      createdAt: parseNotificationCreatedAt(item.sk),
      body: item.body,
    });
  }

  if (work.length > 0) {
    await Promise.all(work);
  }

  return survivors;
}

export async function dismissNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  sk: string,
): Promise<boolean> {
  const pk = notificationPk(userId);
  const existing = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk, sk },
  }));
  if (existing.Item === undefined) {
    return false;
  }

  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk, sk },
  }));
  return true;
}

export async function enqueueGameStartNotifications(
  client: DynamoDBDocumentClient,
  tableName: string,
  game: NotificationGame,
  settingsByUserId?: InAppSettingsByUserId,
): Promise<void> {
  const humanIds = await filterHumanIds(game.players.map(p => p.id));
  const humanPlayers = game.players.filter(p => humanIds.includes(p.id));
  const variants = gameVariants(game);

  await Promise.all(humanPlayers.map(async (player) => {
    const opponent = opponentForPlayer(game, player.id, humanPlayers);
    if (opponent === undefined) {
      return;
    }
    await createNotification(client, tableName, player.id, {
      type: 'gameStart',
      gameId: game.id,
      metaGame: game.metaGame,
      variants,
      opponentId: opponent.id,
      opponentName: opponent.name,
    }, {
      userSettings: userSettingsFromMap(settingsByUserId, player.id),
    });
  }));
}

export async function enqueueGameEndNotifications(
  client: DynamoDBDocumentClient,
  tableName: string,
  game: NotificationGame,
  settingsByUserId?: InAppSettingsByUserId,
): Promise<void> {
  const variants = gameVariants(game);
  const work: Promise<void>[] = [];

  for (let ind = 0; ind < game.players.length; ind += 1) {
    const player = game.players[ind];
    work.push(createNotification(client, tableName, player.id, {
      type: 'gameEnd',
      gameId: game.id,
      metaGame: game.metaGame,
      variants,
      result: gameEndResult(game, player.id),
    }, {
      userSettings: userSettingsFromMap(settingsByUserId, player.id),
    }));
  }

  await Promise.all(work);
}

/** In-app invite for moderated ORGEVENT records (not automated tournaments). */
export async function hasActiveEventInvitationNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  eventId: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const pk = notificationPk(userId);
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      const rec = item as NotificationRecord;
      if (rec.expiresAt <= nowSec) {
        continue;
      }
      if (rec.body.type === 'eventInvitation' && rec.body.eventId === eventId) {
        return true;
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return false;
}

/** Notify newly added invitees and existing invitees missing an active notification. */
export async function resolveEventInvitationNotifyIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  inviteeIds: string[],
  newlyInvitedIds: string[],
  eventId: string,
): Promise<string[]> {
  const humanInvitees = await filterHumanIds(inviteeIds);
  const newlyInvited = new Set(await filterHumanIds(newlyInvitedIds));
  const toNotify = new Set<string>();

  for (const id of humanInvitees) {
    if (newlyInvited.has(id)) {
      toNotify.add(id);
      continue;
    }
    if (!(await hasActiveEventInvitationNotification(client, tableName, id, eventId))) {
      toNotify.add(id);
    }
  }

  return [...toNotify];
}

export async function enqueueEventInvitationNotifications(
  client: DynamoDBDocumentClient,
  tableName: string,
  inviteeIds: string[],
  invitation: EventInvitationNotification,
  settingsByUserId?: InAppSettingsByUserId,
): Promise<void> {
  const humanIds = await filterHumanIds(inviteeIds);
  await Promise.all(humanIds.map(inviteeId => createNotification(client, tableName, inviteeId, {
    type: 'eventInvitation',
    eventId: invitation.eventId,
    eventName: invitation.eventName,
    organizerId: invitation.organizerId,
    organizerName: invitation.organizerName,
  }, {
    userSettings: userSettingsFromMap(settingsByUserId, inviteeId),
  })));
}

export type CompletedGameChatPlayer = {
  id: string;
  name: string;
};

export async function hasActiveCompletedGameChatNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const pk = notificationPk(userId);
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      const rec = item as NotificationRecord;
      if (rec.expiresAt <= nowSec) {
        continue;
      }
      if (rec.body.type === 'completedGameChat' && rec.body.gameId === gameId) {
        return true;
      }
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return false;
}

/** Notify opponents when someone comments on a completed game (post-game exploration). */
export async function enqueueCompletedGameChatNotifications(
  client: DynamoDBDocumentClient,
  tableName: string,
  gameId: string,
  metaGame: string,
  variants: string[] | undefined,
  players: CompletedGameChatPlayer[],
  commenterId: string,
  options?: { backfill?: boolean; settingsByUserId?: InAppSettingsByUserId },
): Promise<void> {
  const variantList = variants ?? [];
  const commenter = players.find(p => p.id === commenterId);
  const commenterName = commenter?.name ?? 'Someone';
  const work: Promise<void>[] = [];

  for (const player of players) {
    if (player.id === commenterId) {
      continue;
    }
    work.push((async () => {
      if (await isBotId(player.id)) {
        return;
      }
      if (await hasActiveCompletedGameChatNotification(client, tableName, player.id, gameId)) {
        return;
      }
      await createNotification(client, tableName, player.id, {
        type: 'completedGameChat',
        gameId,
        metaGame,
        variants: variantList,
        commenterId,
        commenterName,
        ...(options?.backfill ? { backfill: true } : {}),
      }, {
        userSettings: userSettingsFromMap(options?.settingsByUserId, player.id),
      });
    })());
  }

  await Promise.all(work);
}

/** One-time backfill: unread completed-game chat → in-app notification (generic message). */
export async function backfillCompletedGameChatNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
  metaGame: string,
  variants?: string[],
): Promise<'created' | 'skipped_dup'> {
  if (await hasActiveCompletedGameChatNotification(client, tableName, userId, gameId)) {
    return 'skipped_dup';
  }
  await putNotificationItem(client, tableName, userId, {
    type: 'completedGameChat',
    gameId,
    metaGame,
    variants: variants ?? [],
    commenterId: '',
    commenterName: '',
    backfill: true,
  });
  return 'created';
}
