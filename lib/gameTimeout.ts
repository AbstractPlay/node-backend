import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DashboardGame } from './dashboardGames.js';

export type TimelossFn = (
  check: boolean,
  player: number,
  gameid: string,
  metaGame: string,
  timestamp: number,
) => Promise<unknown>;

export type GameTimeoutDeps = {
  client: DynamoDBDocumentClient;
  tableName: string;
  timeloss: TimelossFn;
  now?: () => number;
  log?: (message: string) => void;
};

export type GameTimeoutResult = {
  processed: boolean;
  game: DashboardGame;
};

function isConditionalFailure(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'name' in err
    && (err as { name: string }).name === 'ConditionalCheckFailedException';
}

/**
 * Detect and process a clock timeout for a single dashboard game.
 * Mutates the passed game object on success or when another request already processed.
 */
export async function checkAndProcessGameTimeout(
  game: DashboardGame,
  deps: GameTimeoutDeps,
): Promise<GameTimeoutResult> {
  const now = deps.now?.() ?? Date.now();
  const log = deps.log ?? (() => {});

  if (!game.clockHard || !game.toMove || game.toMove === '') {
    return { processed: false, game };
  }

  if (Array.isArray(game.toMove)) {
    let minTime = 0;
    let minIndex = -1;
    const elapsed = now - game.lastMoveTime;
    game.toMove.forEach((p, i) => {
      if (p && game.players[i].time! - elapsed < minTime) {
        minTime = game.players[i].time! - elapsed;
        minIndex = i;
      }
    });
    if (minIndex === -1) {
      return { processed: false, game };
    }

    const newLastMoveTime = game.lastMoveTime + game.players[minIndex].time!;
    const expectedToMove = [...game.toMove];

    try {
      await deps.client.send(new UpdateCommand({
        TableName: deps.tableName,
        Key: {
          pk: 'GAME',
          sk: `${game.metaGame}#0#${game.id}`,
        },
        ConditionExpression: 'toMove = :expectedToMove',
        ExpressionAttributeValues: {
          ':expectedToMove': expectedToMove,
          ':newToMove': '',
          ':newLastMoveTime': newLastMoveTime,
        },
        UpdateExpression: 'set toMove = :newToMove, lastMoveTime = :newLastMoveTime',
      }));

      log(`Successfully marked simultaneous game ${game.id} as timed out, processing...`);
      game.toMove = '';
      game.lastMoveTime = newLastMoveTime;
      await deps.timeloss(false, minIndex, game.id, game.metaGame, game.lastMoveTime);
      return { processed: true, game };
    } catch (err: unknown) {
      if (isConditionalFailure(err)) {
        log(`Simultaneous game ${game.id} already processed, skipping`);
        game.toMove = '';
        game.lastMoveTime = newLastMoveTime;
        return { processed: false, game };
      }
      throw err;
    }
  }

  const toMove = parseInt(String(game.toMove), 10);
  if (game.players[toMove].time! - (now - game.lastMoveTime) >= 0) {
    return { processed: false, game };
  }

  const newLastMoveTime = game.lastMoveTime + game.players[toMove].time!;
  try {
    await deps.client.send(new UpdateCommand({
      TableName: deps.tableName,
      Key: {
        pk: 'GAME',
        sk: `${game.metaGame}#0#${game.id}`,
      },
      ConditionExpression: 'toMove = :expectedToMove',
      ExpressionAttributeValues: {
        ':expectedToMove': toMove.toString(),
        ':newToMove': '',
        ':newLastMoveTime': newLastMoveTime,
      },
      UpdateExpression: 'set toMove = :newToMove, lastMoveTime = :newLastMoveTime',
    }));

    log(`Successfully marked game ${game.id} as timed out, processing...`);
    game.lastMoveTime = newLastMoveTime;
    game.toMove = '';
    await deps.timeloss(false, toMove, game.id, game.metaGame, game.lastMoveTime);
    return { processed: true, game };
  } catch (err: unknown) {
    if (isConditionalFailure(err)) {
      log(`Game ${game.id} already processed by another request, skipping`);
      game.toMove = '';
      game.lastMoveTime = newLastMoveTime;
      return { processed: false, game };
    }
    throw err;
  }
}

export async function sweepUserGameTimeouts(
  games: DashboardGame[],
  deps: GameTimeoutDeps,
): Promise<DashboardGame[]> {
  const result: DashboardGame[] = [];
  for (const game of games) {
    const { game: updated } = await checkAndProcessGameTimeout(game, deps);
    result.push(updated);
  }
  return result;
}
