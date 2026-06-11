import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from './ddb';

const BOTNAME_PK = 'BOTNAME';
const MAX_BOT_DISPLAY_NAME_LENGTH = 64;

export class BotNameTakenError extends Error {
  constructor(message = 'That bot name is already in use') {
    super(message);
    this.name = 'BotNameTakenError';
  }
}

export class BotNameValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotNameValidationError';
  }
}

export function normalizeBotDisplayName(name: string): string {
  return name.trim().toLowerCase();
}

export function validateBotDisplayName(name: string): string {
  const displayName = name.trim();
  if (displayName.length === 0) {
    throw new BotNameValidationError('A name is required for the bot');
  }
  if (displayName.length > MAX_BOT_DISPLAY_NAME_LENGTH) {
    throw new BotNameValidationError(`Bot name must be at most ${MAX_BOT_DISPLAY_NAME_LENGTH} characters`);
  }
  return displayName;
}

function getTableName(): string {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    throw new Error('ABSTRACT_PLAY_TABLE environment variable is not set');
  }
  return tableName;
}

export async function assertBotDisplayNameAvailable(
  name: string,
  options?: { excludeBotClientId?: string }
): Promise<void> {
  const tableName = getTableName();
  const normalizedName = normalizeBotDisplayName(name);
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: BOTNAME_PK, sk: normalizedName },
    })
  );

  if (!data.Item) {
    return;
  }

  const existingClientId = data.Item.clientId as string | undefined;
  if (options?.excludeBotClientId && existingClientId === options.excludeBotClientId) {
    return;
  }

  throw new BotNameTakenError();
}

export async function reserveBotDisplayName(
  name: string,
  clientId: string,
  owner: string
): Promise<string> {
  const displayName = validateBotDisplayName(name);
  const tableName = getTableName();
  const normalizedName = normalizeBotDisplayName(displayName);

  try {
    await ddbDocClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: BOTNAME_PK,
          sk: normalizedName,
          clientId,
          owner,
          displayName,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === 'ConditionalCheckFailedException') {
      throw new BotNameTakenError();
    }
    throw error;
  }

  return displayName;
}

export async function releaseBotDisplayName(name: string): Promise<void> {
  const normalizedName = normalizeBotDisplayName(name);
  if (!normalizedName) {
    return;
  }

  await ddbDocClient.send(
    new DeleteCommand({
      TableName: getTableName(),
      Key: { pk: BOTNAME_PK, sk: normalizedName },
    })
  );
}

export async function renameBotDisplayName(
  oldName: string,
  newName: string,
  clientId: string,
  owner: string
): Promise<string> {
  const displayName = validateBotDisplayName(newName);
  const oldNormalized = normalizeBotDisplayName(oldName);
  const newNormalized = normalizeBotDisplayName(displayName);

  if (oldNormalized === newNormalized) {
    return displayName;
  }

  await reserveBotDisplayName(displayName, clientId, owner);

  try {
    await releaseBotDisplayName(oldName);
  } catch (error) {
    await releaseBotDisplayName(displayName);
    throw error;
  }

  return displayName;
}
