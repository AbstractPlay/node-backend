import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { GameFactory } from '@abstractplay/gameslib';
import { ddbDocClient } from './ddb';
import { hydrateGameState } from './gameState';
import { signBotPayload } from './botSigning';
import { BotRecord, getBotRecord } from './participants';

const REGION = 'us-east-1';
const BOT_HTTP_TIMEOUT_MS = 30_000;
const sqsClient = new SQSClient({ region: REGION });

export type BotOutboundChallengeMessage = {
  type: 'challenge';
  challengeId: string;
  metaGame: string;
  botId: string;
  standing: boolean;
};

export type BotOutboundMoveMessage = {
  type: 'move';
  metaGame: string;
  gameid: string;
  botId: string;
};

export type BotOutboundMessage = BotOutboundChallengeMessage | BotOutboundMoveMessage;

type ChallengeRecord = {
  metaGame: string;
  variants: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  challenger: { id: string };
  challengees?: { id: string }[];
  players?: { id: string }[];
};

type GameRecord = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  players: { id: string; name: string; time?: number }[];
  toMove: string | boolean[];
  state: string;
};

export type BotPostResult = {
  statusCode: number;
  reachable: boolean;
};

export async function enqueueBotOutbound(message: BotOutboundMessage): Promise<void> {
  const queueUrl = process.env.BOT_OUTBOUND_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('BOT_OUTBOUND_QUEUE_URL environment variable is not set');
  }
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    })
  );
}

export function getToMovePlayerIds(
  game: { toMove: string | boolean[] | null | undefined; players: { id: string }[] },
  simultaneous: boolean
): string[] {
  const ids: string[] = [];
  if (game.toMove === '' || game.toMove === null || game.toMove === undefined) {
    return ids;
  }
  if (simultaneous) {
    const toMove = game.toMove as boolean[];
    for (let i = 0; i < toMove.length; i++) {
      if (toMove[i]) {
        ids.push(game.players[i].id);
      }
    }
  } else {
    ids.push(game.players[parseInt(game.toMove as string, 10)].id);
  }
  return ids;
}

function buildChallengersList(challenge: ChallengeRecord, botId: string): string[] {
  const ids = new Set<string>();
  ids.add(challenge.challenger.id);
  challenge.challengees?.forEach(c => {
    if (c.id !== botId) {
      ids.add(c.id);
    }
  });
  challenge.players?.forEach(p => {
    if (p.id !== botId) {
      ids.add(p.id);
    }
  });
  return [...ids];
}

export function buildOutChallengePayload(challenge: ChallengeRecord, botId: string) {
  return {
    verb: 'challenge' as const,
    metaGame: challenge.metaGame,
    variants: challenge.variants ?? [],
    clockStart: challenge.clockStart,
    clockInc: challenge.clockInc,
    clockMax: challenge.clockMax,
    challengers: buildChallengersList(challenge, botId),
  };
}

export function buildOutMovePayload(game: GameRecord, botId: string) {
  const engine = GameFactory(game.metaGame, game.state);
  if (!engine) {
    throw new Error(`Unknown metaGame ${game.metaGame}`);
  }
  const botIndex = game.players.findIndex(p => p.id === botId);
  if (botIndex === -1) {
    throw new Error(`Bot ${botId} is not a player in game ${game.id}`);
  }
  const botPlayer = game.players[botIndex];
  const moves = engine.moveHistory();
  const engineWithContext = engine as { botContext?: () => Record<string, unknown> | null };
  const context = typeof engineWithContext.botContext === 'function'
    ? engineWithContext.botContext()
    : null;

  const payload: Record<string, unknown> = {
    verb: 'move',
    metaGame: game.metaGame,
    variants: game.variants ?? [],
    gameid: game.id,
    clockCurr: Math.round((botPlayer.time ?? 0) / 3_600_000),
    numPlayers: game.numPlayers,
    moves,
  };
  if (context !== null && context !== undefined) {
    payload.context = context;
  }
  return payload;
}

async function recordBotContact(botId: string, statusCode: number, reachable: boolean): Promise<void> {
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: 'BOT', sk: botId },
      ExpressionAttributeValues: {
        ':ls': Date.now(),
        ':sc': statusCode,
        ':ok': reachable && statusCode >= 200 && statusCode < 300,
      },
      UpdateExpression: 'set lastseen = :ls, lastStatusCode = :sc, operational = :ok',
    })
  );
}

export async function postToBot(
  bot: BotRecord,
  body: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST',
  expectedStatus = 200
): Promise<BotPostResult> {
  const rawBody = method === 'POST' ? JSON.stringify(body) : '';
  const headers: Record<string, string> = {
    ...signBotPayload(rawBody),
  };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  let statusCode = 0;
  let reachable = false;
  try {
    const response = await fetch(bot.endpoint, {
      method,
      headers,
      body: method === 'POST' ? rawBody : undefined,
      signal: AbortSignal.timeout(BOT_HTTP_TIMEOUT_MS),
    });
    statusCode = response.status;
    reachable = true;
  } catch (error) {
    console.error(`Failed to reach bot ${bot.sk} at ${bot.endpoint}:`, error);
    statusCode = 0;
  }

  await recordBotContact(bot.sk, statusCode, reachable);
  console.log(
    `Bot ${bot.sk} ${method} -> status ${statusCode}, reachable=${reachable}, expected=${expectedStatus}`
  );
  return { statusCode, reachable };
}

export async function loadChallengeRecord(
  challengeId: string,
  metaGame: string,
  standing: boolean
): Promise<ChallengeRecord | undefined> {
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: standing ? `STANDINGCHALLENGE#${metaGame}` : 'CHALLENGE',
        sk: challengeId,
      },
    })
  );
  return data.Item as ChallengeRecord | undefined;
}

export async function loadGameRecord(metaGame: string, gameid: string): Promise<GameRecord | undefined> {
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: 'GAME',
        sk: `${metaGame}#0#${gameid}`,
      },
    })
  );
  const item = data.Item as GameRecord | undefined;
  return item !== undefined ? hydrateGameState(item) : undefined;
}

export async function processBotChallengeMessage(message: BotOutboundChallengeMessage): Promise<void> {
  const bot = await getBotRecord(message.botId);
  if (!bot) {
    console.error(`Bot ${message.botId} not found for challenge ${message.challengeId}`);
    return;
  }

  const challenge = await loadChallengeRecord(message.challengeId, message.metaGame, message.standing);
  if (!challenge) {
    console.log(`Challenge ${message.challengeId} no longer exists; skipping bot notification`);
    return;
  }

  const payload = buildOutChallengePayload(challenge, message.botId);
  const result = await postToBot(bot, payload, 'POST', 200);
  const accepted = result.statusCode === 200;

  const { botRespondToChallenge } = await import('../api/abstractplay');
  await botRespondToChallenge(
    message.botId,
    message.challengeId,
    message.metaGame,
    message.standing,
    accepted
  );
}

export async function processBotMoveMessage(message: BotOutboundMoveMessage): Promise<void> {
  const bot = await getBotRecord(message.botId);
  if (!bot) {
    console.error(`Bot ${message.botId} not found for move notification in game ${message.gameid}`);
    return;
  }

  const game = await loadGameRecord(message.metaGame, message.gameid);
  if (!game) {
    console.log(`Game ${message.gameid} not found; skipping bot move notification`);
    return;
  }

  const payload = buildOutMovePayload(game, message.botId);
  await postToBot(bot, payload, 'POST', 202);
}
