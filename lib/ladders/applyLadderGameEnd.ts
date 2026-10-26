import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { computeLadderPointDeltas } from './delta.js';
import { computePaceMultiplier } from './paceMultiplier.js';
import { getLadderRecord } from './ladderStore.js';
import { ladderGameSk, ladderPlayerSk } from './keys.js';
import type { LadderGameRecord, LadderTuning } from './types.js';
import { recordLadderPairPlayed } from './pairHistory.js';

const TABLE = () => process.env.ABSTRACT_PLAY_TABLE!;

export type LadderFinishedGame = {
  id: string;
  ladderId: string;
  metaGame: string;
  variants?: string[];
  winner?: number[];
  players: { id: string }[];
  rated?: boolean;
  gameStarted?: number;
  gameEnded?: number;
  numMoves?: number;
};

export async function applyLadderGameEnd(game: LadderFinishedGame): Promise<void> {
  if (game.ladderId === undefined) {
    return;
  }
  if (game.rated === false) {
    console.warn(`applyLadderGameEnd: game ${game.id} has ladderId but rated=false`);
    return;
  }
  if (game.winner === undefined || (game.winner.length !== 1 && game.winner.length !== 2)) {
    console.warn(`applyLadderGameEnd: game ${game.id} invalid winner ${JSON.stringify(game.winner)}`);
    return;
  }

  const lgKey = { pk: 'LADDERGAME', sk: ladderGameSk(game.ladderId, game.id) };
  const lgRow = await ddbDocClient.send(new GetCommand({
    TableName: TABLE(),
    Key: lgKey,
  }));
  const ladderGame = lgRow.Item as LadderGameRecord | undefined;
  if (ladderGame === undefined) {
    console.warn(`applyLadderGameEnd: missing LADDERGAME for ${game.ladderId}#${game.id}`);
    return;
  }
  if (ladderGame.settled) {
    return;
  }

  const ladder = await getLadderRecord(game.ladderId);
  if (ladder === undefined) {
    console.warn(`applyLadderGameEnd: missing LADDER ${game.ladderId}`);
    return;
  }
  const tuning: LadderTuning = ladder.tuning;

  const p0 = game.players[0]!.id;
  const p1 = game.players[1]!.id;
  const [row0, row1] = await Promise.all([
    ddbDocClient.send(new GetCommand({
      TableName: TABLE(),
      Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(game.ladderId, p0) },
    })),
    ddbDocClient.send(new GetCommand({
      TableName: TABLE(),
      Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(game.ladderId, p1) },
    })),
  ]);
  const player0 = row0.Item;
  const player1 = row1.Item;
  if (player0 === undefined || player1 === undefined) {
    console.warn(`applyLadderGameEnd: missing LADDERPLAYER for game ${game.id}`);
    return;
  }

  const now = game.gameEnded ?? Date.now();
  const pace = computePaceMultiplier(
    game.gameStarted ?? now,
    now,
    game.numMoves ?? 0,
    tuning,
  );

  const transactItems: object[] = [];
  const activityUpdate = {
    TableName: TABLE(),
    Key: { pk: 'LADDERGAME', sk: ladderGameSk(game.ladderId, game.id) },
    UpdateExpression: 'SET settled = :t, settledAt = :now',
    ConditionExpression: 'attribute_not_exists(settled) OR settled = :f',
    ExpressionAttributeValues: { ':t': true, ':now': now, ':f': false },
  };

  if (game.winner.length === 1) {
    const winnerIndex = game.winner[0]! - 1;
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winnerId = game.players[winnerIndex]!.id;
    const loserId = game.players[loserIndex]!.id;
    const winnerRow = winnerId === p0 ? player0 : player1;
    const loserRow = loserId === p0 ? player0 : player1;
    const winnerBefore = winnerRow.points as number;
    const loserBefore = loserRow.points as number;
    const { winnerGain, loserLoss } = computeLadderPointDeltas(
      winnerBefore,
      loserBefore,
      pace,
      tuning,
    );
    const winnerAfter = winnerBefore + winnerGain;
    const loserAfter = Math.max(0, loserBefore - loserLoss);

    transactItems.push({
      Update: {
        TableName: TABLE(),
        Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(game.ladderId, winnerId) },
        UpdateExpression: 'SET points = :p, lastLadderActivityAt = :now ADD activeLadderGameCount :neg',
        ConditionExpression: 'activeLadderGameCount > :zero',
        ExpressionAttributeValues: {
          ':p': winnerAfter,
          ':now': now,
          ':neg': -1,
          ':zero': 0,
        },
      },
    });
    transactItems.push({
      Update: {
        TableName: TABLE(),
        Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(game.ladderId, loserId) },
        UpdateExpression: 'SET points = :p, lastLadderActivityAt = :now ADD activeLadderGameCount :neg',
        ConditionExpression: 'activeLadderGameCount > :zero',
        ExpressionAttributeValues: {
          ':p': loserAfter,
          ':now': now,
          ':neg': -1,
          ':zero': 0,
        },
      },
    });
  } else {
    for (const pid of [p0, p1]) {
      transactItems.push({
        Update: {
          TableName: TABLE(),
          Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(game.ladderId, pid) },
          UpdateExpression: 'SET lastLadderActivityAt = :now ADD activeLadderGameCount :neg',
          ConditionExpression: 'activeLadderGameCount > :zero',
          ExpressionAttributeValues: { ':now': now, ':neg': -1, ':zero': 0 },
        },
      });
    }
  }

  transactItems.push({ Update: activityUpdate });

  try {
    await ddbDocClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
    await recordLadderPairPlayed(ddbDocClient, TABLE(), game.ladderId, p0, p1, now);
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === 'TransactionCanceledException') {
      const recheck = await ddbDocClient.send(new GetCommand({ TableName: TABLE(), Key: lgKey }));
      if ((recheck.Item as LadderGameRecord | undefined)?.settled) {
        return;
      }
    }
    throw err;
  }
}
