import { DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import {
  AUTOMATED_TOURNAMENT_CLOCK_INC,
  AUTOMATED_TOURNAMENT_CLOCK_MAX,
  tournamentInitialBankMs,
} from '../tournaments/clock.js';
import {
  buildTournamentGamePlayers,
  type TournamentPairingPlayer,
} from '../tournaments/createTournamentPairingGame.js';
import { prepareGameStateForStorage } from '../gameState.js';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { enqueueGameStartNotifications } from '../notifications.js';
import { getLadderRecord } from './ladderStore.js';
import { ladderGameSk, ladderPlayerSk, ladderSeriesSk } from './keys.js';
import { ladderPairOpenGameIncrementTransactItem } from './pairHistory.js';
export type CreateLadderGameParams = {
  client: DynamoDBDocumentClient;
  tableName: string;
  ladderId: string;
  players: [TournamentPairingPlayer, TournamentPairingPlayer];
  gameId?: string;
  now?: number;
};

export async function createLadderGame(params: CreateLadderGameParams): Promise<{ gameId: string }> {
  const {
    client,
    tableName,
    ladderId,
    players,
  } = params;
  const now = params.now ?? Date.now();
  const gameId = params.gameId ?? uuid();

  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    throw new Error(`Unknown ladder ${ladderId}`);
  }
  const tuning = ladder.tuning;
  const maxGames = tuning.maxConcurrentLadderGames;
  const metaGame = ladder.metaGame;
  const variants = ladder.variants;
  const clockStart = AUTOMATED_TOURNAMENT_CLOCK_MAX;
  const clockInc = AUTOMATED_TOURNAMENT_CLOCK_INC;
  const clockMax = AUTOMATED_TOURNAMENT_CLOCK_MAX;
  const bankMs = tournamentInitialBankMs(clockMax);
  const pairingPlayers: [TournamentPairingPlayer, TournamentPairingPlayer] = [
    { ...players[0], time: bankMs },
    { ...players[1], time: bankMs },
  ];

  const gamePlayers = buildTournamentGamePlayers(metaGame, pairingPlayers);
  const info = gameinfo.get(metaGame);
  let whoseTurn: string | boolean[] = '0';
  if (info?.flags?.includes('simultaneous')) {
    whoseTurn = gamePlayers.map(() => true);
  }

  let engine;
  if (info && info.playercounts.length > 1) {
    engine = GameFactory(metaGame, 2, variants);
  } else {
    engine = GameFactory(metaGame, undefined, variants);
  }
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  const state = engine.serialize();
  const gameSk = `${metaGame}#0#${gameId}`;
  const seriesKey = ladderSeriesSk(metaGame, variants);

  const gameItem: Record<string, unknown> = {
    pk: 'GAME',
    sk: gameSk,
    id: gameId,
    metaGame,
    numPlayers: 2,
    rated: true,
    players: gamePlayers,
    clockStart,
    clockInc,
    clockMax,
    clockHard: true,
    state,
    toMove: whoseTurn,
    lastMoveTime: now,
    gameStarted: now,
    variants: engine.variants,
    ladderId,
    ladderSeries: seriesKey,
  };

  const ladderGameItem = {
    pk: 'LADDERGAME',
    sk: ladderGameSk(ladderId, gameId),
    ladderId,
    gameId,
    settled: false,
  };

  const transactItems = [
    {
      Update: {
        TableName: tableName,
        Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(ladderId, players[0].id) },
        ConditionExpression: 'membershipStatus = :active AND activeLadderGameCount < :max',
        UpdateExpression: 'ADD activeLadderGameCount :one',
        ExpressionAttributeValues: { ':active': 'active', ':max': maxGames, ':one': 1 },
      },
    },
    {
      Update: {
        TableName: tableName,
        Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(ladderId, players[1].id) },
        ConditionExpression: 'membershipStatus = :active AND activeLadderGameCount < :max',
        UpdateExpression: 'ADD activeLadderGameCount :one',
        ExpressionAttributeValues: { ':active': 'active', ':max': maxGames, ':one': 1 },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: prepareGameStateForStorage(gameItem as { state: string }),
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: ladderGameItem,
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    },
    ladderPairOpenGameIncrementTransactItem(
      tableName,
      ladderId,
      players[0].id,
      players[1].id,
    ),
  ];

  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));

  await enqueueGameStartNotifications(client, tableName, {
    id: gameId,
    metaGame,
    variants: engine.variants,
    players: gamePlayers.map(p => ({ id: p.id, name: p.name })),
  });

  return { gameId };
}

/** Dequeue both players from pool (Phase 2); safe no-op if missing. */
export async function dequeueLadderPool(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladderId: string,
  userIds: string[],
): Promise<void> {
  for (const userid of userIds) {
    try {
      await client.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: 'LADDERPOOL', sk: `${ladderId}#${userid}` },
      }));
    } catch {
      // pool row may be absent
    }
  }
}
