import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import type { User } from '../api/types.js';
import { prepareGameStateForStorage } from '../gameState.js';
import { enqueueGameStartNotifications } from '../notifications.js';

export type TournamentPairingPlayer = {
  id: string;
  name: string;
  time: number;
};

export type CreateTournamentPairingGameParams = {
  client: DynamoDBDocumentClient;
  tableName: string;
  tournamentId: string;
  metaGame: string;
  variants: string[];
  division: number;
  players: [TournamentPairingPlayer, TournamentPairingPlayer];
  matchLeg?: 1 | 2;
  schedulingRound?: number;
  rematchOf?: string;
  gameId?: string;
  now?: number;
  clockStart: number;
  clockInc: number;
  clockMax: number;
};

export function buildTournamentGamePlayers(
  metaGame: string,
  orderedPlayers: [TournamentPairingPlayer, TournamentPairingPlayer],
): User[] {
  const info = gameinfo.get(metaGame);
  const base: User[] = orderedPlayers.map(p => ({
    id: p.id,
    name: p.name,
    time: p.time,
  }));
  if (info?.flags?.includes('perspective')) {
    return base.map((p, ind) =>
      ind === 0 ? p : { ...p, settings: { rotate: 180 } });
  }
  return base;
}

export function swappedTournamentPairingPlayers(
  players: [TournamentPairingPlayer, TournamentPairingPlayer],
): [TournamentPairingPlayer, TournamentPairingPlayer] {
  return [players[1], players[0]];
}

export async function createTournamentPairingGame(
  params: CreateTournamentPairingGameParams,
): Promise<{ gameId: string }> {
  const {
    client,
    tableName,
    tournamentId,
    metaGame,
    variants,
    division,
    players,
    matchLeg,
    schedulingRound,
    rematchOf,
    clockStart,
    clockInc,
    clockMax,
  } = params;
  const now = params.now ?? Date.now();
  const gameId = params.gameId ?? uuid();
  const info = gameinfo.get(metaGame);

  const gamePlayers = buildTournamentGamePlayers(metaGame, players);
  let whoseTurn: string | boolean[] = '0';
  if (info?.flags?.includes('simultaneous')) {
    whoseTurn = gamePlayers.map(() => true);
  }

  let engine;
  if (info.playercounts.length > 1) {
    engine = GameFactory(metaGame, 2, variants);
  } else {
    engine = GameFactory(metaGame, undefined, variants);
  }
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  const state = engine.serialize();
  const gameSk = `${metaGame}#0#${gameId}`;
  const tgSk = `${tournamentId}#${division.toString()}#${gameId}`;

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
    tournament: tournamentId,
    division,
  };
  if (matchLeg !== undefined) {
    gameItem.matchLeg = matchLeg;
  }
  if (schedulingRound !== undefined) {
    gameItem.schedulingRound = schedulingRound;
  }
  if (rematchOf !== undefined) {
    gameItem.rematchOf = rematchOf;
  }

  await client.send(new PutCommand({
    TableName: tableName,
    Item: prepareGameStateForStorage(gameItem as { state: string }),
  }));

  await enqueueGameStartNotifications(client, tableName, {
    id: gameId,
    metaGame,
    variants: engine.variants,
    players: gamePlayers.map(p => ({ id: p.id, name: p.name })),
  });

  const tournamentGame: Record<string, unknown> = {
    pk: 'TOURNAMENTGAME',
    sk: tgSk,
    id: gameId,
    player1: gamePlayers[0]!.id,
    player2: gamePlayers[1]!.id,
  };
  if (matchLeg !== undefined) {
    tournamentGame.matchLeg = matchLeg;
  }
  if (rematchOf !== undefined) {
    tournamentGame.rematchOf = rematchOf;
  }

  await client.send(new PutCommand({
    TableName: tableName,
    Item: tournamentGame,
  }));

  return { gameId };
}
