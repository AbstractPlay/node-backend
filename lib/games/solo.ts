import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { headers } from '../api/http.js';
import type { User } from '../api/types.js';
import { getParticipants } from '../participants.js';
import { prepareGameStateForStorage } from '../gameState.js';
import {
  buildStartSoloGame,
  normalizeSoloClocks,
  soloPlaySupported,
} from '../soloGame.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';
import {
  enqueueGameStartNotifications,
  inAppSettingsMapFromUsers,
} from '../notifications.js';

export async function startSoloGame(userid: string, pars: {
  metaGame?: string;
  variants?: string[];
  challengeSeed?: string;
  clockStart?: number;
  clockInc?: number;
  clockMax?: number;
  clockHard?: boolean;
  noExplore?: boolean;
}) {
  const metaGame = pars.metaGame;
  if (metaGame === undefined || metaGame.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "metaGame is required" }),
      headers,
    };
  }
  if (!soloPlaySupported(metaGame)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Game ${metaGame} does not support solo play` }),
      headers,
    };
  }
  const variantErr = validateChallengeVariantUids(metaGame, pars.variants);
  if (variantErr) {
    return variantErr;
  }

  let built;
  try {
    built = buildStartSoloGame({
      metaGame,
      variants: pars.variants,
      challengeSeed: pars.challengeSeed,
      noExplore: pars.noExplore,
      ...normalizeSoloClocks(pars),
    });
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `${error}` }),
      headers,
    };
  }

  const info = gameinfo.get(metaGame)!;
  const playersFull = await getParticipants([userid]);
  const player = playersFull[0];
  if (player === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Could not load player profile" }),
      headers,
    };
  }

  const clocks = normalizeSoloClocks(pars);
  const now = Date.now();
  let whoseTurn: string | boolean[] = "0";
  if (info.flags !== undefined && info.flags.includes('simultaneous')) {
    whoseTurn = [true];
  }

  const gamePlayers = [{
    id: player.id,
    name: player.name,
    time: clocks.clockStart * 3600000,
  }] as User[];

  await ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Item: prepareGameStateForStorage({
      pk: "GAME",
      sk: `${metaGame}#0#${built.gameId}`,
      id: built.gameId,
      metaGame,
      numPlayers: 1,
      rated: false,
      players: gamePlayers,
      clockStart: clocks.clockStart,
      clockInc: clocks.clockInc,
      clockMax: clocks.clockMax,
      clockHard: clocks.clockHard,
      noExplore: pars.noExplore || false,
      state: built.state,
      toMove: whoseTurn,
      lastMoveTime: now,
      gameStarted: now,
      variants: built.variants,
    }),
  }));

  await enqueueGameStartNotifications(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    {
      id: built.gameId,
      metaGame,
      variants: built.variants,
      players: gamePlayers.map(p => ({ id: p.id, name: p.name })),
    },
    inAppSettingsMapFromUsers([{ id: player.id, settings: player.settings }]),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      gameId: built.gameId,
      metaGame: info.name,
      metaGameUid: metaGame,
      challengeSeed: built.challengeSeed,
      simultaneous: info.flags !== undefined && info.flags.includes('simultaneous'),
    }),
    headers,
  };
}
