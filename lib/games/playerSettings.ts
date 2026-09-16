import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import { getPlayers } from '../players/getPlayers.js';
import { ensureMetaGameCountEntry } from '../metaGameBootstrap.js';
import { adjustShardedCounts } from '../gameProjector.js';
import { hydrateGameState, prepareGameStateForStorage } from '../gameState.js';
import { stripColorFromSettings } from '../stripLegacyColorSettings.js';
import { normalizeAvatarInSettings } from '../dicebearAvatar.js';
import { feedbackNewKindsFromSettings, syncFeedbackNewNotifyIndex } from '../feedback/feedbackNewNotifyIndex.js';
import { syncAnnouncementNotifyIndex } from '../announcements/announcementNotifyIndex.js';

type FullGame = {
  id: string;
  metaGame: string;
  state: string;
  players: { id: string; settings?: unknown }[];
};

export async function toggleStar(userid: string, pars: { metaGame: string }) {
  try {
    // get player
    const player = (await getPlayers([userid]))[0];
    // add or remove metaGame
    let delta = 0;
    if (player.stars === undefined) {
      player.stars = [];
    }
    if (!player.stars.includes(pars.metaGame)) {
      delta = 1;
      player.stars.push(pars.metaGame);
    } else {
      delta = -1;
      const idx = player.stars.findIndex((m: string) => m === pars.metaGame);
      player.stars.splice(idx, 1);
    }
    // queue player update
    const list: Promise<any>[] = [];
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":ss": player.stars },
        UpdateExpression: "set stars = :ss",
      }))
    );
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": player.id },
        ExpressionAttributeValues: { ":ss": player.stars },
        UpdateExpression: "set stars = :ss",
      }))
    );
    console.log(`Queued update to player ${player.id}, ${player.name}, toggling star for ${pars.metaGame}: ${delta}`);

    await ensureMetaGameCountEntry(pars.metaGame);

    list.push(adjustShardedCounts(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      pars.metaGame,
      { stars: delta },
    ));

    // run all updates
    console.log("Running queued updates");
    await Promise.all(list);
    console.log("Done");
    return {
      statusCode: 200,
      body: JSON.stringify(player.stars),
      headers
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to toggle star for ${userid}, ${pars.metaGame} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

// NOTE: This function will blow up hidden-information games
export async function injectState(userid: string, pars: { id: string; newState: string; metaGame: string; }) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
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
    return formatReturnError(`Unable to inject state ${userid}`);
  }

  // get the game. For now we will assume this isn't a finished game.
  let game: FullGame;
  try {
    const getGame = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
      }));
    const gameData = await getGame;
    console.log("Got:");
    console.log(gameData);
    game = hydrateGameState(gameData.Item as FullGame);
    if (game === undefined) {
      throw new Error(`Game ${pars.id} not found`);
    }
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  // update the state
  game.state = pars.newState;

  // store the updated game
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: prepareGameStateForStorage(game)
    }));
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to update game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify(game),
    headers
  };
}

export async function updateGameSettings(userid: string, pars: { game: string, settings: any, metaGame: string, cbit: number }) {
  if (pars.cbit !== 0 && pars.cbit !== 1) {
    return formatReturnError("cbit must be 0 or 1");
  }
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#" + pars.cbit + '#' + pars.game
        },
      }));
    console.log("Got:");
    console.log(data);
    const game = hydrateGameState(data.Item as FullGame);
    if (game === undefined)
      throw new Error(`updateGameSettings: game ${pars.game} not found`);
    const player = game.players.find((p: { id: any; }) => p.id === userid);
    if (player === undefined)
      throw new Error(`updateGameSettings: player ${userid} isn't playing in game ${pars.game}`);
    player.settings = stripColorFromSettings(pars.settings);
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: prepareGameStateForStorage(game)
      }));
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
    return {
      statusCode: 200,
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get or update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}






export async function updateUserSettings(userid: string, pars: { settings: any; }) {
  try {
    const settings = stripColorFromSettings(pars.settings) as Record<string, unknown>;
    const avatarResult = normalizeAvatarInSettings(settings);
    if (!avatarResult.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: avatarResult.error }),
        headers,
      };
    }

    const updateParts = ['settings = :ss'];
    const expressionValues: Record<string, unknown> = { ':ss': settings };
    const removeParts: string[] = [];

    if (avatarResult.hasAvatar) {
      const avatar = (settings.all as Record<string, unknown>).profile as Record<string, unknown>;
      const stored = avatar.avatar as { style: string; seed: string };
      updateParts.push('avatarStyle = :avatarStyle', 'avatarSeed = :avatarSeed');
      expressionValues[':avatarStyle'] = stored.style;
      expressionValues[':avatarSeed'] = stored.seed;
    } else {
      removeParts.push('avatarStyle', 'avatarSeed');
    }

    const updateExpression = `set ${updateParts.join(', ')}${
      removeParts.length > 0 ? ` remove ${removeParts.join(', ')}` : ''
    }`;

    const userUpdate = new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      ExpressionAttributeValues: expressionValues,
      UpdateExpression: updateExpression,
    });

    const usersAvatarUpdate = avatarResult.hasAvatar
      ? new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": userid },
        ExpressionAttributeValues: {
          ':avatarStyle': expressionValues[':avatarStyle'],
          ':avatarSeed': expressionValues[':avatarSeed'],
        },
        UpdateExpression: 'set avatarStyle = :avatarStyle, avatarSeed = :avatarSeed',
      })
      : new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": userid },
        UpdateExpression: 'remove avatarStyle, avatarSeed',
      });

    await Promise.all([
      ddbDocClient.send(userUpdate),
      ddbDocClient.send(usersAvatarUpdate),
    ]);

    const feedbackTable = process.env.FEEDBACK_TABLE;
    if (feedbackTable) {
      try {
        const kinds = feedbackNewKindsFromSettings(settings);
        await syncFeedbackNewNotifyIndex(ddbDocClient, feedbackTable, userid, kinds);
      } catch (syncErr) {
        console.error('syncFeedbackNewNotifyIndex failed', syncErr);
      }
    }

    const mainTable = process.env.ABSTRACT_PLAY_TABLE;
    if (mainTable) {
      try {
        await syncAnnouncementNotifyIndex(ddbDocClient, mainTable, userid, settings);
      } catch (syncErr) {
        console.error('syncAnnouncementNotifyIndex failed', syncErr);
      }
    }

    console.log("Success - user settings updated");
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user settings for user ${userid}`,
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to store user settings for user ${userid}`);
  }
}
