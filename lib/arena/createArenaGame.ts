import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { prepareGameStateForStorage } from '../gameState.js';
import { tournamentPlaySupported } from '../tournamentGame.js';
import { getPlayers } from '../players/getPlayers.js';
import type { ArenaClockSnapshot } from '../gamePlayMode.js';
import { getArenaTimeControl } from './timeControls.js';
import { beginArenaCountdown } from './arenaSyncStart.js';

export type CreateArenaGameParams = {
  client: DynamoDBDocumentClient;
  tableName: string;
  gameId: string;
  metaGame: string;
  tcId: string;
  playerIds: [string, string];
  variants?: string[];
  now?: number;
  /** Dev-only: start 3s countdown without play-ready pings. */
  armCountdownImmediately?: boolean;
};

export async function createArenaGame(params: CreateArenaGameParams): Promise<{ gameId: string }> {
  const {
    client,
    tableName,
    gameId,
    metaGame,
    tcId,
    playerIds,
    variants,
  } = params;
  const now = params.now ?? Date.now();

  if (!tournamentPlaySupported(metaGame)) {
    throw new Error(`Meta-game ${metaGame} does not support 2-player arena`);
  }
  const tc = getArenaTimeControl(tcId);
  if (!tc || !tc.enabled) {
    throw new Error(`Unknown or disabled arena time control ${tcId}`);
  }

  const users = await getPlayers(playerIds);
  if (users.length !== 2) {
    throw new Error('Both arena players must exist');
  }

  const info = gameinfo.get(metaGame);
  let whoseTurn: string | boolean[] = '0';
  const engine = info && info.playercounts.length > 1
    ? GameFactory(metaGame, 2, variants)
    : GameFactory(metaGame, undefined, variants);
  if (!engine) {
    throw new Error(`Unknown metaGame ${metaGame}`);
  }
  if (info?.flags?.includes('simultaneous')) {
    whoseTurn = [true, true];
  }

  const bankMs = tc.startSec * 1000;
  const arenaClock: ArenaClockSnapshot = {
    startSec: tc.startSec,
    incSec: tc.incSec,
    maxSec: tc.maxSec,
  };

  const gameItem: Record<string, unknown> = {
    pk: 'GAME',
    sk: `${metaGame}#0#${gameId}`,
    id: gameId,
    metaGame,
    numPlayers: 2,
    rated: false,
    unrated: true,
    playMode: 'arena',
    arenaTcId: tcId,
    arenaClock,
    clockGeneration: 1,
    clockHard: true,
    clockStart: 0,
    clockInc: 0,
    clockMax: 0,
    players: users.map((u, i) => ({
      id: u.id,
      name: u.name,
      time: bankMs,
      seat: i,
    })),
    state: engine.serialize(),
    toMove: whoseTurn,
    lastMoveTime: 0,
    arenaPlayReady: [],
    gameStarted: now,
    variants: engine.variants,
  };

  await client.send(new PutCommand({
    TableName: tableName,
    Item: prepareGameStateForStorage(gameItem as { state: string }),
    ConditionExpression: 'attribute_not_exists(pk)',
  }));

  if (params.armCountdownImmediately) {
    await beginArenaCountdown(
      client,
      tableName,
      gameItem as Parameters<typeof beginArenaCountdown>[2],
      now,
    );
  }

  return { gameId };
}
