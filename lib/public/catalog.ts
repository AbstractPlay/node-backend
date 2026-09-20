import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { gameinfo, GameFactory } from '@abstractplay/gameslib';
import { isMetaGamePlayableOnStage } from '../metaGameRetraction.js';
import { validateToken } from '@sunknudsen/totp';
import { ddbDocClient } from '../ddb.js';
import { sesClient, s3Client } from '../api/clients.js';
import {
  headers,
  cachedListHeaders,
  feedbackListHeaders,
  formatReturnError,
  logGetItemError,
} from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import type { User, UsersData } from '../api/types.js';

import { hydrateGameState } from '../gameState.js';
import { sanitizeInGameCommentedFlags } from '../gameComments.js';
import { loadSummaryPlayerCountsByUid } from '../summaryRatings.js';
import {
  queryRecentCompletedGames,
  type RecentCompletedGamesPars,
} from '../recentCompletedGames.js';
import {
  DEFAULT_META_GAME_COUNTS,
  ensureMissingMetaGameCounts,
  assembleTags,
  type MetaGameCounts,
} from '../metaGameBootstrap.js';

type FullGame = {
  metaGame: string;
  state: string;
  id: string;
  players: User[];
  toMove?: string;
  gameStarted?: number;
  commented?: number;
  variants?: string[];
};

export async function userNames() {
  // Bots are listed from the stage's DynamoDB table (abstract-play-dev vs abstract-play-prod).
  // Bot Cognito credentials are also per-stage; dev tokens cannot call prod botQuery.
  console.log("userNames: Scanning users.");
  try {
    const [data, botData, adminData] = await Promise.all([
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "USERS" },
          ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
          ProjectionExpression: "sk, #name, lastSeen, country, stars, bggid, avatarStyle, avatarSeed",
          ReturnConsumedCapacity: "INDEXES"
        })),
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "BOT" },
          ExpressionAttributeNames: { "#pk": "pk", "#name": "name" },
          ProjectionExpression: "sk, #name, lastseen, description, supported",
        })),
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          FilterExpression: "admin = :admin",
          ExpressionAttributeNames: { "#pk": "pk" },
          ExpressionAttributeValues: { ":pk": "USER", ":admin": true },
          ProjectionExpression: "sk",
        })),
    ]);
    const adminIds = new Set((adminData.Items ?? []).map((user) => String(user.sk)));

    const users = data.Items;
    if (users == undefined) {
      throw new Error("Found no users?");
    }

    // tweak bot info
    const idx = users.findIndex(u => u.sk === process.env.AIAI_USERID);
    if (idx !== -1) {
      users[idx].lastSeen = Date.now();
    }

    const userResults = users.map(u => ({
      id: u.sk,
      name: u.name,
      country: u.country,
      stars: u.stars,
      lastSeen: u.lastSeen,
      bggid: u.bggid,
      ...(u.avatarStyle && u.avatarSeed
        ? { avatarStyle: u.avatarStyle as string, avatarSeed: u.avatarSeed as string }
        : {}),
      ...(adminIds.has(u.sk) ? { admin: true } : {}),
      bot: false,
    } as UsersData));
    const botResults = (botData.Items ?? []).map(b => ({
      id: b.sk,
      name: b.name,
      country: "",
      stars: [...new Set(((b.supported ?? []) as { meta: string }[]).map(s => s.meta))],
      lastSeen: b.lastseen ?? 0,
      bot: true,
    } as UsersData));

    return {
      statusCode: 200,
      body: JSON.stringify([...userResults, ...botResults]),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to query table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

export async function games(pars: { metaGame: string, type: string; }) {
  const game = pars.metaGame;
  console.log(game);

  if (pars.type === "current") {
    try {
      const gamesData = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
          ExpressionAttributeValues: { ":pk": "GAME", ":sk": game + '#0#' },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));

      const gamelist = (gamesData.Items as FullGame[]).map(hydrateGameState);

      const returnlist = gamelist.map(g => {
        const state = GameFactory(g.metaGame, g.state); // JSON.parse(g.state);
        if (state === undefined) {
          throw new Error(`Could not parse game state for ${g.metaGame}:\n${g.state}`);
        }
        return {
          "id": g.id, "metaGame": g.metaGame, "players": g.players, "toMove": g.toMove, "gameStarted": g.gameStarted,
          "numMoves": state.stack.length - 1, "variants": state.variants, "commented": g.commented || 0
        }
      });
      const tableName = process.env.ABSTRACT_PLAY_TABLE!;
      await sanitizeInGameCommentedFlags(ddbDocClient, tableName, returnlist);
      return {
        statusCode: 200,
        body: JSON.stringify(returnlist),
        headers
      };
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to get games for ${pars.metaGame}`);
    }
  } else if (pars.type === "completed") {
    try {
      const gamesData = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game },
          ExpressionAttributeNames: { "#pk": "pk" }
        }));

      const tableName = process.env.ABSTRACT_PLAY_TABLE!;
      const items = (gamesData.Items ?? []) as Array<{ id: string; commented?: number }>;
      await sanitizeInGameCommentedFlags(ddbDocClient, tableName, items);
      return {
        statusCode: 200,
        body: JSON.stringify(items),
        headers
      };
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to get games for ${pars.metaGame}`);
    }
  } else {
    return formatReturnError(`Unknown type ${pars.type}`);
  }
}

export async function recentCompletedGames(pars: RecentCompletedGamesPars) {
  try {
    const result = await queryRecentCompletedGames(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      pars,
    );
    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: cachedListHeaders,
    };
  } catch (error) {
    logGetItemError(error);
    const message = error instanceof Error ? error.message : 'Unable to get recent completed games';
    return formatReturnError(message);
  }
}

export async function metaGamesDetails() {
  try {
    await ensureMissingMetaGameCounts();
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const metaGames: string[] = [];
    gameinfo.forEach(g => {
      if (isMetaGamePlayableOnStage(g.uid)) {
        metaGames.push(g.uid);
      }
    });
    const details: MetaGameCounts = {};
    let playerCountsByUid: Record<string, number> = {};
    try {
      playerCountsByUid = await loadSummaryPlayerCountsByUid();
    } catch (err) {
      console.warn('metaGamesDetails: batch ratings counts unavailable', err);
    }

    for (let i = 0; i < metaGames.length; i += 100) {
      const chunk = metaGames.slice(i, i + 100);
      const data = await ddbDocClient.send(new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: chunk.map(metaGame => ({ pk: `METAGAMES#${metaGame}`, sk: 'COUNTS' })),
          },
        },
      }));
      for (const item of data.Responses?.[tableName] ?? []) {
        const metaGame = String(item.pk).replace('METAGAMES#', '');
        details[metaGame] = {
          currentgames: item.currentgames ?? 0,
          completedgames: item.completedgames ?? 0,
          standingchallenges: item.standingchallenges ?? 0,
          stars: item.stars ?? 0,
          ratings: playerCountsByUid[metaGame] ?? 0,
        };
      }
    }

    gameinfo.forEach(g => {
      if (!isMetaGamePlayableOnStage(g.uid)) {
        return;
      }
      if (!details[g.uid]) {
        details[g.uid] = {
          ...DEFAULT_META_GAME_COUNTS,
          ratings: playerCountsByUid[g.uid] ?? 0,
        };
      }
    });
    // get list of tags
    const taglist = await assembleTags();
    if (taglist === undefined) {
      throw new Error("An error occured while fetching game tags");
    }
    for (const key of Object.keys(details)) {
      const tags = taglist.find(l => l.meta === key);
      if (tags !== undefined) {
        details[key].tags = [...tags.tags];
      } else {
        details[key].tags = [];
      }
    }
    const details2 = Object.keys(details).reduce((a, k) => ({
      ...a,
      [k]: {
        ...details[k],
        ratings: details[k].ratings ?? 0,
      },
    }), {});
    return {
      statusCode: 200,
      body: JSON.stringify(details2),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError("Unable to get meta game details.");
  }
}
