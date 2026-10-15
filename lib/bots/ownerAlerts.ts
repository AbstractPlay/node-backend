import { GameFactory } from '@abstractplay/gameslib';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { ApiHandlerResult } from '../api/routeTypes.js';
import { ddbDocClient } from '../ddb.js';
import { submitComment } from '../games/playHandlers.js';
import { createNotification, type InAppNotificationUserSettings } from '../notifications.js';
import { loadGameRecord } from '../botOutbound.js';
import type { BotRecord } from '../participants.js';

type BotTurnGame = NonNullable<Awaited<ReturnType<typeof loadGameRecord>>>;

const APPLY_FAILURE_DEDUPE_MS = 15 * 60 * 1000;
const DETAIL_MAX_LEN = 200;

const SYSTEM_CHAT_MESSAGE =
  'The bot could not submit a valid move. Its owner has been notified.';

export type BotApplyFailureContext = {
  botId: string;
  bot: BotRecord;
  game: BotTurnGame;
  gameid: string;
  metaGame: string;
  variants: string[];
  verb: 'move' | 'pie';
  move?: string;
  response: ApiHandlerResult;
};

function parseErrorMessage(response: ApiHandlerResult): string | undefined {
  if (!response.body) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(response.body) as { message?: string };
    return typeof parsed.message === 'string' ? parsed.message : undefined;
  } catch {
    return undefined;
  }
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

async function tryClaimApplyFailureAlert(botId: string, gameId: string): Promise<boolean> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    console.error('recordBotApplyFailure: ABSTRACT_PLAY_TABLE not set');
    return false;
  }
  const now = Date.now();
  const cutoff = now - APPLY_FAILURE_DEDUPE_MS;
  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'BOT', sk: botId },
        UpdateExpression:
          'SET lastApplyFailureAlertAt = :now, lastApplyFailureGameId = :gameId',
        ConditionExpression:
          'attribute_not_exists(lastApplyFailureAlertAt) OR lastApplyFailureGameId <> :gameId OR lastApplyFailureAlertAt < :cutoff',
        ExpressionAttributeValues: {
          ':now': now,
          ':gameId': gameId,
          ':cutoff': cutoff,
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false;
    }
    console.error('recordBotApplyFailure: dedupe update failed', { botId, gameId, error });
    return false;
  }
}

function currentMoveNumber(metaGame: string, state: string, variants: string[]): number {
  const engine = GameFactory(metaGame, state, variants);
  if (!engine) {
    return 0;
  }
  return engine.stack.length;
}

/**
 * Notify bot owner and post in-game system chat when move/pie apply fails after turn validation.
 * Deduped per bot+game within 15 minutes. Never throws.
 */
export async function recordBotApplyFailure(ctx: BotApplyFailureContext): Promise<void> {
  try {
    const claimed = await tryClaimApplyFailureAlert(ctx.botId, ctx.gameid);
    if (!claimed) {
      console.log('recordBotApplyFailure: skipped (deduped)', {
        botId: ctx.botId,
        gameid: ctx.gameid,
      });
      return;
    }

    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const rawDetail = parseErrorMessage(ctx.response);
    const detail = rawDetail
      ? rawDetail.slice(0, DETAIL_MAX_LEN)
      : ctx.move
        ? `move: ${ctx.move.slice(0, 80)}`
        : undefined;

    const ownerSettings = await loadOwnerInAppSettings(ctx.bot.owner);
    await createNotification(
      ddbDocClient,
      tableName,
      ctx.bot.owner,
      {
        type: 'botMoveFailed',
        botId: ctx.botId,
        botName: ctx.bot.name,
        gameId: ctx.gameid,
        metaGame: ctx.metaGame,
        variants: ctx.variants,
        verb: ctx.verb,
        detail,
      },
      { userSettings: ownerSettings },
    );

    const moveNumber = currentMoveNumber(ctx.metaGame, ctx.game.state, ctx.variants);
    const chatResult = await submitComment('', {
      id: ctx.gameid,
      metaGame: ctx.metaGame,
      comment: `${ctx.bot.name}: ${SYSTEM_CHAT_MESSAGE}`,
      moveNumber,
    });
    if (chatResult.statusCode >= 400) {
      console.error('recordBotApplyFailure: submitComment failed', {
        gameid: ctx.gameid,
        statusCode: chatResult.statusCode,
        body: chatResult.body?.slice(0, 300),
      });
    }
  } catch (error) {
    console.error('recordBotApplyFailure: unexpected error', {
      botId: ctx.botId,
      gameid: ctx.gameid,
      error,
    });
  }
}

export function isBotApplyFailureResponse(response: ApiHandlerResult): boolean {
  return response.statusCode >= 400;
}
