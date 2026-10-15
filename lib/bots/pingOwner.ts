import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { headers } from '../api/http.js';
import type { PartialClaims } from '../api/types.js';
import type { ApiHandlerResult } from '../api/routeTypes.js';
import { ddbDocClient } from '../ddb.js';
import { createNotification, type InAppNotificationUserSettings } from '../notifications.js';
import { getBotRecord } from '../participants.js';

const PING_OWNER_COOLDOWN_MS = 5 * 60 * 1000;
const MESSAGE_MAX_LEN = 400;

function sanitizeMessage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.slice(0, MESSAGE_MAX_LEN);
}

async function loadOwnerInAppSettings(ownerId: string): Promise<InAppNotificationUserSettings | undefined> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    return undefined;
  }
  const data = await ddbDocClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: ownerId },
    }),
  );
  if (!data.Item) {
    return undefined;
  }
  return data.Item.settings as InAppNotificationUserSettings | undefined;
}

async function tryClaimPingOwner(botId: string): Promise<boolean> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    return false;
  }
  const now = Date.now();
  const cutoff = now - PING_OWNER_COOLDOWN_MS;
  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'BOT', sk: botId },
        UpdateExpression: 'SET lastPingOwnerAt = :now',
        ConditionExpression:
          'attribute_not_exists(lastPingOwnerAt) OR lastPingOwnerAt < :cutoff',
        ExpressionAttributeValues: {
          ':now': now,
          ':cutoff': cutoff,
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false;
    }
    console.error('handlePingOwner: rate-limit update failed', { botId, error });
    return false;
  }
}

export async function handlePingOwner(
  claims: PartialClaims,
  body: Record<string, unknown>,
): Promise<ApiHandlerResult> {
  const botId = claims.sub;
  const message = sanitizeMessage(body.message);
  if (!message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'message is required (1–400 characters)' }),
      headers,
    };
  }

  const gameid = typeof body.gameid === 'string' ? body.gameid.trim() : '';
  const metaGame = typeof body.metaGame === 'string' ? body.metaGame.trim() : '';
  if ((gameid && !metaGame) || (!gameid && metaGame)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'gameid and metaGame must both be provided or omitted' }),
      headers,
    };
  }

  const bot = await getBotRecord(botId);
  if (!bot) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Unknown bot ${botId}` }),
      headers,
    };
  }

  const claimed = await tryClaimPingOwner(botId);
  if (!claimed) {
    return {
      statusCode: 200,
      body: JSON.stringify({ notified: false, reason: 'rate_limited' }),
      headers,
    };
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const ownerSettings = await loadOwnerInAppSettings(bot.owner);
  await createNotification(
    ddbDocClient,
    tableName,
    bot.owner,
    {
      type: 'botOwnerPing',
      botId,
      botName: bot.name,
      message,
      ...(gameid ? { gameId: gameid, metaGame } : {}),
    },
    { userSettings: ownerSettings },
  );

  console.log('handlePingOwner: notified owner', { botId, owner: bot.owner, gameid: gameid || undefined });

  return {
    statusCode: 200,
    body: JSON.stringify({ notified: true }),
    headers,
  };
}
