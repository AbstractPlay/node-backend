import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { gameinfo } from '@abstractplay/gameslib';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { adminDeleteGame } from '../adminDeleteGame.js';
import { loadSummaryPlayerCountsByUid } from '../summaryRatings.js';
import { hasCurrentGameRow } from '../dashboardGames.js';
import { upsertUserGameOverlay } from '../userGameOverlay.js';
import { setWatchedSeen } from '../playerGameMarks.js';
import { updateCompletedGameCommentedFlag } from '../recentCompletedGames.js';

type FullUser = {
  id: string;
  name: string;
  email: string;
  admin?: boolean;
  stars?: string[];
  settings?: import('../api/types.js').UserSettings;
};

type Note = {
  pk: string;
  sk: string;
  note: string;
};

async function* queryItemsGenerator(queryInput: QueryCommandInput): AsyncGenerator<unknown> {
  let lastEvaluatedKey: Record<string, any> | undefined
  do {
    const { Items, LastEvaluatedKey } = await ddbDocClient
      .send(new QueryCommand({ ...queryInput, ExclusiveStartKey: lastEvaluatedKey }));
    lastEvaluatedKey = LastEvaluatedKey
    if (Items !== undefined) {
      yield Items
    }
  } while (lastEvaluatedKey !== undefined)
}


export async function deleteGames(userId: string, pars: { metaGame: string, cbit: number, gameids: string }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get user ${userId}. Error: ${error}`);
  }

  if (pars.cbit !== 0 && pars.cbit !== 1) {
    return formatReturnError('cbit must be 0 or 1');
  }

  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const preferredCbit = pars.cbit as 0 | 1;
  const gameids = pars.gameids.split(",").map(id => id.trim()).filter(id => id.length > 0);
  const results: Awaited<ReturnType<typeof adminDeleteGame>>[] = [];

  try {
    for (const gameid of gameids) {
      results.push(await adminDeleteGame(
        ddbDocClient,
        tableName,
        pars.metaGame,
        gameid,
        preferredCbit,
      ));
    }

    const notFound = results.filter(result => result.notFound).map(result => result.gameId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: notFound.length > 0
          ? `Deleted ${results.length - notFound.length} game(s); not found: ${notFound.join(', ')}`
          : `Deleted ${results.length} game(s)`,
        results,
      }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to delete games ${pars.gameids}. Error: ${error}`);
  }
}


export async function updateNote(userId: string, pars: { gameId: string; note?: string; }) {
  // if note is empty, delete the record
  if ((pars.note === undefined) || (pars.note === null) || (pars.note.length === 0)) {
    try {
      await ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "NOTE", "sk": `${pars.gameId}#${userId}`,
          },
        })
      )
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to updateNote (delete, actually) ${userId}`);
    }
    // otherwise, just PUT it!
  } else {
    const note: Note = {
      pk: "NOTE",
      sk: `${pars.gameId}#${userId}`,
      note: pars.note,
    }
    console.log(`Setting note for user ${userId}, game ${pars.gameId}.`);
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: note
      }));
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to updateNote ${userId}`);
    }
  }
  return {
    statusCode: 200,
    body: "",
    headers
  };
}

// updateCommented has no participant/admin gate today; client side effects of commented-flag updates are not fully understood.
export async function updateCommented(userId: string, pars: { id: string; metaGame: string; cbit: number; commented: number; gameEnded?: number; }) {
  console.log(`Updating commented flag for game ${pars.id} to ${pars.commented}, cbit=${pars.cbit}, gameEnded=${pars.gameEnded}`);
  try {
    if (pars.cbit === 1 && pars.gameEnded !== undefined) {
      await updateCompletedGameCommentedFlag(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        pars.metaGame,
        pars.id,
        pars.gameEnded,
        pars.commented,
      );
      console.log(`Successfully updated commented flag in COMPLETEDGAMES for game ${pars.id} to ${pars.commented}`);
    } else if (pars.cbit === 0) {
      // For current games, update GAME table
      await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
        ExpressionAttributeValues: { ":c": pars.commented },
        UpdateExpression: "set commented = :c",
        ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
      }));
      console.log(`Successfully updated commented flag in GAME for game ${pars.id} to ${pars.commented}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update commented flag for game ${pars.id}: ${err}`);
  }
}

export async function setLastSeen(userId: string, pars: { gameId: string; interval?: number; }) {
  // get USER rec
  let user: FullUser | undefined;
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (data.Item !== undefined) {
      user = data.Item as FullUser;
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to setLastSeen ${userId}`);
  }
  if (user !== undefined) {
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const onCurrent = await hasCurrentGameRow(ddbDocClient, tableName, userId, pars.gameId);
    if (onCurrent) {
      // set lastSeen to "now" + interval
      let interval = 8;
      if (pars.interval !== undefined) {
        interval = pars.interval;
      }
      const now = new Date();
      const then = new Date();
      then.setDate(now.getDate() - interval);
      console.log(`Setting lastSeen for ${pars.gameId} to ${then.getTime()} (${then.toUTCString()}). It is currently ${new Date().toUTCString()}`);
      await upsertUserGameOverlay(
        ddbDocClient,
        process.env.ABSTRACT_PLAY_TABLE!,
        userId,
        pars.gameId,
        { seen: then.getTime(), lastChat: then.getTime() },
      );
      return {
        statusCode: 200,
        body: "",
        headers
      };
    }
  }
  let interval = 8;
  if (pars.interval !== undefined) {
    interval = pars.interval;
  }
  const now = new Date();
  const then = new Date();
  then.setDate(now.getDate() - interval);
  const watchedUpdated = await setWatchedSeen(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    userId,
    pars.gameId,
    then.getTime(),
    then.getTime(),
  );
  if (watchedUpdated) {
    return {
      statusCode: 200,
      body: "",
      headers
    };
  }
  return {
    statusCode: 406,
    body: "",
    headers
  };
}


export async function onetimeFix(userId: string) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to onetimeFix ${userId}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: 'onetime_fix is retired. It previously synced USER profile fields into the USERS directory index.',
      useInstead: 'No replacement — run a targeted script or one-off repair if USERS directory fields are stale.',
    }),
    headers
  };
}

export async function fixGames(userId: string, pars: { targetId: string }) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      })
    );
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fix_games ${userId}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: 'fix_games no longer rebuilds USER.games[]. Dashboard membership is index-only (CURRENTGAMES#, USERGAME#).',
      useInstead: [
        'Verify: node bin/verify-dashboard-index.mjs --stage prod --verbose <userId>',
        'Purge USERGAME# orphans: node bin/dashboard-index-maintenance.mjs --stage prod --step purge-usergame-orphans --user-id <userId>',
        'If legacy RECENTCOMPLETED# rows reappear: node bin/dashboard-index-maintenance.mjs --stage prod --step purge-all-recent-completed',
      ],
      targetId: pars.targetId,
    }),
    headers
  };
}


export async function purgeRetiredCompletedGames(userId: string) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to purge retired completed games ${userId}`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      deprecated: true,
      message: 'purge_retired_completed_games is retired. One-time purge complete (no retired COMPLETEDGAMES pk shapes remain).',
      useInstead: [],
    }),
    headers
  };
}

export async function updateMetaGameCounts(userId: string) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }

    const metaGames: string[] = [];
    gameinfo.forEach((game) => metaGames.push(game.uid));
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const currentgames = metaGames.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAME", ":sk": game + '#0#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    const completedgames = metaGames.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    const standingchallenges = metaGames.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    let playerCountsByUid: Record<string, number> = {};
    try {
      playerCountsByUid = await loadSummaryPlayerCountsByUid();
    } catch (err) {
      console.warn('updateMetaGameCounts: batch ratings counts unavailable', err);
    }

    const work = await Promise.all([
      Promise.all(currentgames),
      Promise.all(completedgames),
      Promise.all(standingchallenges),
    ]);
    console.log("updateMetaGameCounts recount complete");

    // process stars
    const players = await getAllUsers();
    console.log("All players");
    console.log(JSON.stringify(players.map(p => p.name)));
    const starCounts = new Map<string, number>();
    for (const p of players) {
      if (p.stars !== undefined) {
        for (const star of p.stars) {
          if (starCounts.has(star)) {
            const val = starCounts.get(star)!;
            starCounts.set(star, val + 1);
          } else {
            starCounts.set(star, 1);
          }
        }
      }
    }

    const shardedCounts: Record<string, {
      currentgames: number;
      completedgames: number;
      standingchallenges: number;
      stars: number;
      ratingsCount: number;
    }> = {};
    metaGames.forEach((game, ind) => {
      shardedCounts[game] = {
        currentgames: work[0][ind].Items ? work[0][ind].Items!.length : 0,
        completedgames: work[1][ind].Items ? work[1][ind].Items!.length : 0,
        standingchallenges: work[2][ind].Items ? work[2][ind].Items!.length : 0,
        stars: starCounts.has(game) ? starCounts.get(game)! : 0,
        ratingsCount: playerCountsByUid[game] ?? 0,
      };
    });

    console.log(shardedCounts);
    await Promise.all(metaGames.map(metaGame =>
      ddbDocClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `METAGAMES#${metaGame}`,
          sk: 'COUNTS',
          ...shardedCounts[metaGame],
        },
      }))
    ));

    return {
      statusCode: 200,
      body: JSON.stringify({ metaGames: metaGames.length }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update meta game counts ${userId}`);
  }
}


const getAllUsers = async (): Promise<FullUser[]> => {
  const result: FullUser[] = []
  const queryInput: QueryCommandInput = {
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: {
      '#pk': 'pk',
    },
    ExpressionAttributeValues: {
      ':pk': 'USER',
    },
    TableName: process.env.ABSTRACT_PLAY_TABLE,
  }
  for await (const page of queryItemsGenerator(queryInput)) {
    result.push(...page as FullUser[]);
  }
  return result
}
