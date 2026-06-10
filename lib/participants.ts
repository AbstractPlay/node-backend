import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb';

export type BotRecord = {
  pk?: string;
  sk: string;
  name: string;
  endpoint: string;
  owner: string;
  lastseen?: number;
  description?: string;
  supported?: { meta: string; variants: string[] }[];
  pendingSecretId?: string;
  pendingSecretCreatedAt?: number;
};

export type ClientBot = {
  pk: 'BOT';
  sk: string;
  name: string;
  endpoint: string;
  owner: string;
  lastseen: number;
  description?: string;
  supported?: { meta: string; variants: string[] }[];
  pendingSecretId?: string;
  pendingSecretCreatedAt?: number;
  secretRotationPending: boolean;
};

export function toClientBot(item: BotRecord | undefined): ClientBot | undefined {
  if (!item) {
    return undefined;
  }

  return {
    pk: 'BOT',
    sk: item.sk,
    name: item.name,
    endpoint: item.endpoint,
    owner: item.owner,
    lastseen: item.lastseen ?? 0,
    description: item.description,
    supported: item.supported,
    pendingSecretId: item.pendingSecretId,
    pendingSecretCreatedAt: item.pendingSecretCreatedAt,
    secretRotationPending: item.pendingSecretId !== undefined && item.pendingSecretId !== '',
  };
}

export type Participant = {
  id: string;
  name: string;
  isBot: boolean;
  email?: string;
  language?: string;
  games?: unknown[];
  gamesUpdate?: number;
  settings?: unknown;
  ratings?: {
    [metaGame: string]: {
      rating: number;
      N: number;
      wins: number;
      draws: number;
    };
  };
};

export async function getBotRecord(clientId: string): Promise<BotRecord | undefined> {
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: 'BOT', sk: clientId },
    })
  );
  return data.Item as BotRecord | undefined;
}

export async function isBotId(id: string): Promise<boolean> {
  const bot = await getBotRecord(id);
  return bot !== undefined;
}

export async function getParticipant(id: string): Promise<Participant | undefined> {
  const bot = await getBotRecord(id);
  if (bot) {
    return { id: bot.sk, name: bot.name, isBot: true };
  }

  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: 'USER', sk: id },
    })
  );
  if (!data.Item) {
    return undefined;
  }
  const user = data.Item as {
    id: string;
    name: string;
    email?: string;
    language?: string;
    games?: unknown[];
    gamesUpdate?: number;
    settings?: unknown;
    ratings?: Participant['ratings'];
  };
  return {
    id: user.id ?? id,
    name: user.name,
    isBot: false,
    email: user.email,
    language: user.language,
    games: user.games,
    gamesUpdate: user.gamesUpdate,
    settings: user.settings,
    ratings: user.ratings,
  };
}

export async function getParticipants(ids: string[]): Promise<Participant[]> {
  const participants = await Promise.all(ids.map(id => getParticipant(id)));
  return participants.filter((p): p is Participant => p !== undefined);
}

export async function filterHumanIds(ids: string[]): Promise<string[]> {
  const humanIds: string[] = [];
  for (const id of ids) {
    if (!(await isBotId(id))) {
      humanIds.push(id);
    }
  }
  return humanIds;
}

/** Minimal player shape for code paths that expect a USER-like record. */
export function botToFullUserStub(bot: BotRecord): {
  id: string;
  name: string;
  email: string;
  games: never[];
  language: string;
  country: string;
  admin: false;
  organizer: false;
  settings: Record<string, never>;
} {
  return {
    id: bot.sk,
    name: bot.name,
    email: '',
    games: [],
    language: 'en',
    country: '',
    admin: false,
    organizer: false,
    settings: {},
  };
}
