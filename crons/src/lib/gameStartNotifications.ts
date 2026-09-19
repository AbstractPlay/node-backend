import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

const NOTIFICATION_PK_PREFIX = 'NOTIFICATION#';
const NOTIFICATION_INITIAL_TTL_DAYS = 180;
const SEC_PER_DAY = 86_400;

export type NotificationGamePlayer = {
  id: string;
  name: string;
};

export type NotificationGame = {
  id: string;
  metaGame: string;
  variants?: string[];
  players: NotificationGamePlayer[];
};

type GameStartNotificationBody = {
  type: 'gameStart';
  gameId: string;
  metaGame: string;
  variants: string[];
  opponentId: string;
  opponentName: string;
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

function gameVariants(game: NotificationGame): string[] {
  return game.variants ?? [];
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

function opponentForPlayer(
  game: NotificationGame,
  playerId: string,
  humanPlayers: NotificationGamePlayer[],
): NotificationGamePlayer | undefined {
  return humanPlayers.find(p => p.id !== playerId);
}

async function createGameStartNotification(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  body: GameStartNotificationBody,
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

export async function enqueueGameStartNotifications(
  client: DynamoDBDocumentClient,
  tableName: string,
  game: NotificationGame,
): Promise<void> {
  const humanIds = await filterHumanIds(client, tableName, game.players.map(p => p.id));
  const humanPlayers = game.players.filter(p => humanIds.includes(p.id));
  const variants = gameVariants(game);

  await Promise.all(humanPlayers.map(async (player) => {
    const opponent = opponentForPlayer(game, player.id, humanPlayers);
    if (opponent === undefined) {
      return;
    }
    await createGameStartNotification(client, tableName, player.id, {
      type: 'gameStart',
      gameId: game.id,
      metaGame: game.metaGame,
      variants,
      opponentId: opponent.id,
      opponentName: opponent.name,
    });
  }));
}
