import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb';

export const TEST_BOT_OWNER_ID = '3ccb3a1f-3d25-441e-9efc-e526eac4fe9a';

const TEST_BOT_PK = 'TESTBOT';
const TEST_BOT_SK = 'dev';
const MAX_EVENTS = 50;

export type TestBotMovePolicy = 'pass' | 'firstLegal';

export type TestBotSettings = {
  acceptChallenges: boolean;
  rejectMetaGames: string[];
  movePolicy: TestBotMovePolicy;
  moveDelayMs: number;
};

export type TestBotEvent = {
  ts: number;
  direction: 'inbound' | 'outbound';
  verb: string;
  summary: string;
  statusCode?: number;
  error?: string;
};

export type TestBotState = {
  pk: string;
  sk: string;
  owner: string;
  settings: TestBotSettings;
  recentEvents: TestBotEvent[];
};

export const DEFAULT_TEST_BOT_SETTINGS: TestBotSettings = {
  acceptChallenges: true,
  rejectMetaGames: [],
  movePolicy: 'firstLegal',
  moveDelayMs: 0,
};

function defaultState(): TestBotState {
  return {
    pk: TEST_BOT_PK,
    sk: TEST_BOT_SK,
    owner: TEST_BOT_OWNER_ID,
    settings: { ...DEFAULT_TEST_BOT_SETTINGS, rejectMetaGames: [] },
    recentEvents: [],
  };
}

export async function getOrCreateTestBotState(): Promise<TestBotState> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }

  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
    })
  );

  if (data.Item) {
    return data.Item as TestBotState;
  }

  const item = defaultState();
  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name !== 'ConditionalCheckFailedException') {
      throw error;
    }
    const retry = await ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      })
    );
    if (!retry.Item) {
      throw error;
    }
    return retry.Item as TestBotState;
  }

  return item;
}

export async function appendTestBotEvent(event: TestBotEvent): Promise<void> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }

  const state = await getOrCreateTestBotState();
  const recentEvents = [...(state.recentEvents ?? []), event].slice(-MAX_EVENTS);

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ':events': recentEvents },
      UpdateExpression: 'SET recentEvents = :events',
    })
  );
}

export async function updateTestBotSettings(patch: Partial<TestBotSettings>): Promise<TestBotSettings> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }

  const state = await getOrCreateTestBotState();
  const settings: TestBotSettings = {
    ...state.settings,
    ...patch,
    rejectMetaGames: patch.rejectMetaGames ?? state.settings.rejectMetaGames ?? [],
  };

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: TEST_BOT_PK, sk: TEST_BOT_SK },
      ExpressionAttributeValues: { ':settings': settings },
      UpdateExpression: 'SET settings = :settings',
    })
  );

  return settings;
}

export function isTestBotOwner(userId: string | undefined): boolean {
  return userId === TEST_BOT_OWNER_ID;
}
