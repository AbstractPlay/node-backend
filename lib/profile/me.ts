import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import type { PartialClaims } from '../api/types.js';
import { setToJSONReplacer } from './setToJson.js';
import { getPlayerRelationIds } from '../playerRelations.js';
import { timeloss } from '../games/timeloss.js';
import {
  buildMeDashboardPayload,
  buildMeProfilePayload,
  type MeAncillaryData,
  type MeChallengeData,
} from '../meQuery.js';
import { listActiveGameKeys, loadDashboardGames, type DashboardGame } from '../dashboardGames.js';
import { runDashboardMaintenance } from '../dashboardMaintenance.js';
import { loadNotificationsForDashboard } from '../notifications.js';
import {
  deleteAllPushSubscriptions,
  deletePushSubscriptionByEndpoint,
  queryPushSubscriptions,
  savePushSubscription,
} from '../pushSubscriptions.js';
import { toClientBot, type BotRecord, type ClientBot } from '../participants.js';
import {
  listHighlights,
  listUserRecommendations,
  listWatchedGames,
} from '../playerGameMarks.js';
import { validateAboutText } from '../aboutText.js';
import { checkAboutSaveAllowed } from '../aboutSaves.js';
import { validateUserDisplayName } from '../userDisplayName.js';
import {
  DISPLAY_NAME_TAKEN_MESSAGE,
  isDisplayNameTaken,
} from '../displayNameAvailability.js';

type FullUser = {
  id: string;
  email?: string;
  name?: string;
  language?: string;
  country?: string;
  settings?: unknown;
  admin?: boolean;
  organizer?: boolean;
  stars?: string[];
  bggid?: string;
  about?: string;
  mayPush?: boolean;
  publicRivalries?: boolean;
  cleaned?: boolean;
  bots?: Set<string>;
  challenges_issued?: Set<string>;
  challenges_received?: Set<string>;
  challenges_accepted?: Set<string>;
  challenges_standing?: Set<string>;
};

type StandingChallengeRec = {
  pk: 'REALSTANDING';
  sk: string;
  standing: StandingChallenge[];
};

type TagList = { meta: string; tags: string[] };
type TagRec = { pk: 'TAG'; sk: string; tags: TagList[] };
type Customization = {
  colourContext: Record<string, string>;
  palette: string[];
  glyphmap?: unknown[];
  preferredColour?: string;
};
type CustomizationRec = { pk: string; sk: string; settings: Customization };

type StandingChallenge = {
  id: string;
  metaGame: string;
  numPlayers: number;
  variants?: string[];
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  limit: number;
  sensitivity: 'meta' | 'variants';
  suspended: boolean;
};

const Set_toJSON = setToJSONReplacer;

async function loadMeUser(claim: PartialClaims): Promise<FullUser | undefined> {
  const userId = claim.sub;
  const email = claim.email;
  if (!email || email.trim().length === 0) {
    console.log(`How!?: claim.email is ${email}`);
  }
  console.log('Getting USER record');
  const userData = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: 'USER',
        sk: userId,
      },
    }),
  );
  if (userData.Item === undefined) {
    return undefined;
  }
  const user = userData.Item as FullUser;
  if (user.email !== email) {
    await updateUserEMail(claim);
  }
  return user;
}

async function clearUserCleanedFlag(userId: string, user: FullUser): Promise<void> {
  if (user.cleaned !== true) {
    return;
  }
  await ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE!,
    Key: { pk: 'USER', sk: userId },
    UpdateExpression: 'REMOVE cleaned',
  }));
  delete user.cleaned;
}

async function resolveMeAncillary(userId: string, user: FullUser): Promise<MeAncillaryData> {
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const tagWork = ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: 'TAG', sk: userId },
    }),
  );
  const standingWork = ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { pk: 'REALSTANDING', sk: userId },
    }),
  );
  const customizationWork = ddbDocClient.send(
    new QueryCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeValues: { ':pk': `CUSTOMIZATION#${userId}` },
      ExpressionAttributeNames: { '#pk': 'pk' },
    }),
  );
  const botIds: string[] = Array.from(user?.bots ?? new Set());
  const [
    tagData,
    standingData,
    customizationData,
    botData,
    blocked,
    watchedGames,
    highlights,
    representatives,
  ] = await Promise.all([
    tagWork,
    standingWork,
    customizationWork,
    getBots(botIds),
    getPlayerRelationIds(userId, 'BLOCKED#'),
    listWatchedGames(ddbDocClient, tableName, userId),
    listHighlights(ddbDocClient, tableName, userId),
    listUserRecommendations(ddbDocClient, tableName, userId),
  ]);

  let tags: TagList[] = [];
  if (tagData.Item !== undefined) {
    tags = (tagData.Item as TagRec).tags;
  }
  let realStanding: StandingChallenge[] = [];
  if (standingData.Item !== undefined) {
    realStanding = (standingData.Item as StandingChallengeRec).standing;
  }
  const customizations: { [key: string]: Customization } = {};
  if (customizationData.Items !== undefined) {
    for (const item of customizationData.Items as CustomizationRec[]) {
      const settings: unknown = item.settings;
      if (typeof settings === 'string') {
        customizations[item.sk] = JSON.parse(settings);
      } else {
        customizations[item.sk] = settings as Customization;
      }
    }
  }
  const bots = (botData as { Item?: BotRecord }[])
    .map(d => toClientBot(d.Item))
    .filter((bot): bot is ClientBot => bot !== undefined);

  return {
    tags,
    realStanding,
    customizations,
    bots,
    blocked,
    watchedGames,
    highlights,
    representatives,
  };
}

async function resolveMeChallenges(user: FullUser): Promise<MeChallengeData> {
  const challengesIssuedIDs: string[] = Array.from(user?.challenges_issued ?? new Set());
  const challengesReceivedIDs: string[] = Array.from(user?.challenges_received ?? new Set());
  const challengesAcceptedIDs: string[] = Array.from(user?.challenges_accepted ?? new Set());
  const standingChallengeIDs: string[] = Array.from(user?.challenges_standing ?? new Set());
  const [
    challengesIssued,
    challengesReceived,
    challengesAccepted,
    standingChallenges,
  ] = await Promise.all([
    getChallenges(challengesIssuedIDs),
    getChallenges(challengesReceivedIDs),
    getChallenges(challengesAcceptedIDs),
    getChallenges(standingChallengeIDs),
  ]);
  return {
    challengesIssued: challengesIssued.map(d => d.Item),
    challengesReceived: challengesReceived.map(d => d.Item),
    challengesAccepted: challengesAccepted.map(d => d.Item),
    standingChallenges: standingChallenges.map(d => d.Item),
  };
}

export async function meProfile(claim: PartialClaims) {
  const userId = claim.sub;
  console.log(`me_profile: user id ${userId}`);
  try {
    const user = await loadMeUser(claim);
    if (user === undefined) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers,
      };
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const [activeGames, ancillary] = await Promise.all([
      listActiveGameKeys(ddbDocClient, tableName, userId),
      resolveMeAncillary(userId, user),
    ]);
    return {
      statusCode: 200,
      body: JSON.stringify(buildMeProfilePayload(user as Parameters<typeof buildMeProfilePayload>[0], ancillary, activeGames), Set_toJSON),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get profile data for ${userId}`);
  }
}

export async function meDashboard(claim: PartialClaims, pars: { size: string, vars: string, update: string }) {
  const userId = claim.sub;
  console.log(`me_dashboard: user id ${userId}, vars ${pars?.vars}, update ${pars?.update}`);
  try {
    const user = await loadMeUser(claim);
    if (user === undefined) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers,
      };
    }
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    await clearUserCleanedFlag(userId, user);
    let games = await loadDashboardGames(ddbDocClient, tableName, userId);
    const maintenance = await runDashboardMaintenance(
      ddbDocClient,
      tableName,
      userId,
      games,
      {
        client: ddbDocClient,
        tableName,
        timeloss,
      },
    );
    games = maintenance.games;
    if (maintenance.evictedIds.length > 0) {
      console.log(`me_dashboard evicted games for ${user.name}:`, maintenance.evictedIds);
    }
    console.log('Fetching challenges');
    const [ancillary, challenges, notifications] = await Promise.all([
      resolveMeAncillary(userId, user),
      resolveMeChallenges(user),
      loadNotificationsForDashboard(ddbDocClient, tableName, userId, { refreshExpiry: false }),
    ]);
    console.log(`me_dashboard returning for ${user.name}, id ${user.id} with games`, games);
    return {
      statusCode: 200,
      body: JSON.stringify(buildMeDashboardPayload(user as Parameters<typeof buildMeDashboardPayload>[0], ancillary, games, challenges, notifications), Set_toJSON),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get dashboard data for ${userId}`);
  }
}

export async function nextGame(userid: string) {
  try {
    console.log(`Getting USER record`);
    const userData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (userData.Item === undefined) {
      return {
        statusCode: 400,
        headers
      };
    }
    const userRec = userData.Item as FullUser;
    const games = await loadDashboardGames(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userid,
    );

    // get list of all games where it is your turn
    type GameWithTime = {
      game: DashboardGame;
      remaining: number;
    };
    const yourturn: GameWithTime[] = [];
    for (const game of games) {
      const thisPlayerIdx = game.players.findIndex(p => p.id === userid);
      // explicitly this player's turn
      if ((Array.isArray(game.toMove) && game.toMove.length > thisPlayerIdx + 1 && game.toMove[thisPlayerIdx]) || (game.toMove === thisPlayerIdx.toString())) {
        const remaining = (game.players[thisPlayerIdx].time || 0) - (Date.now() - game.lastMoveTime);
        yourturn.push({ game, remaining });
      }
    }
    // sort by time remaining
    yourturn.sort((a, b) => a.remaining - b.remaining);
    console.log(`It is your turn in ${yourturn.length} games.`)
    console.log(`Yourturn results: ${JSON.stringify(yourturn, null, 2)}`)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(yourturn.map(x => x.game)),
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get next game for ${userid}`);
  }
}

async function updateUserEMail(claim: PartialClaims) {
  if (claim.email && claim.email.trim().length > 0) {
    console.log(`updateUserEMail: updating email to ${claim.email}`);
    return ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": claim.sub },
      ExpressionAttributeValues: { ":e": claim.email },
      UpdateExpression: "set email = :e",
    }));
  } else {
    console.log(`updateUserEMail: claim.email is ${claim.email}`);
  }
}

export async function mySettings(claim: PartialClaims) {
  const userId = claim.sub;
  const email = claim.email;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
        ExpressionAttributeNames: { "#name": "name", "#language": "language" },
        ProjectionExpression: "id,#name,email,#language",
      }));
    if (user.Item === undefined)
      throw new Error("mySettings no user ${userId}");
    if (user.Item.email !== email)
      await updateUserEMail(claim);

    console.log("mySettings Item: ", user.Item);
    return {
      statusCode: 200,
      body: JSON.stringify({
        "id": user.Item.id,
        "name": user.Item.name,
        "email": email,
        "language": user.Item.language
      }, Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get user data for ${userId}`);
  }
}

async function loadAboutSaveState(userId: string) {
  const userData = await ddbDocClient.send(new GetCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE!,
    Key: { pk: 'USER', sk: userId },
    ProjectionExpression: 'aboutSaveDay, aboutSaveCount',
  }));
  return {
    aboutSaveDay: userData.Item?.aboutSaveDay as string | undefined,
    aboutSaveCount: userData.Item?.aboutSaveCount as number | undefined,
  };
}

async function saveUserAbout(userId: string, rawValue: string) {
  const validated = validateAboutText(rawValue);
  if (!validated.ok) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: validated.message }),
      headers,
    };
  }
  const val = validated.text;

  try {
    const tableName = process.env.ABSTRACT_PLAY_TABLE!;
    const userData = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: 'USER', sk: userId },
      ProjectionExpression: 'about, aboutSaveDay, aboutSaveCount',
    }));
    const userItem = userData.Item ?? {};
    const saveCheck = checkAboutSaveAllowed(
      userItem.about,
      val,
      {
        aboutSaveDay: userItem.aboutSaveDay,
        aboutSaveCount: userItem.aboutSaveCount,
      },
    );
    if (!saveCheck.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: saveCheck.message }),
        headers,
      };
    }

    const userUpdateValues: Record<string, unknown> = { ':v': val };
    const userUpdateNames: Record<string, string> = { '#a': 'about' };
    let userUpdateExpression = 'set #a = :v';
    if (!saveCheck.skip) {
      userUpdateValues[':day'] = saveCheck.aboutSaveDay;
      userUpdateValues[':count'] = saveCheck.aboutSaveCount;
      userUpdateNames['#day'] = 'aboutSaveDay';
      userUpdateNames['#count'] = 'aboutSaveCount';
      userUpdateExpression += ', #day = :day, #count = :count';
    }

    await Promise.all([
      ddbDocClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USER', sk: userId },
        ExpressionAttributeValues: userUpdateValues,
        ExpressionAttributeNames: userUpdateNames,
        UpdateExpression: userUpdateExpression,
      })),
      ddbDocClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'USERS', sk: userId },
        ExpressionAttributeValues: { ':v': val },
        ExpressionAttributeNames: { '#a': 'about' },
        UpdateExpression: 'set #a = :v',
      })),
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({ result: 'success' }, Set_toJSON),
      headers,
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update about for ${userId}`);
  }
}

export async function newSetting(userId: string, pars: { attribute: string; value: string; }) {
  if (pars.attribute === 'about') {
    return await saveUserAbout(userId, pars.value);
  }

  let attr = '';
  let val = '';
  switch (pars.attribute) {
    case "name": {
      const validated = validateUserDisplayName(pars.value);
      if (!validated.ok) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: validated.message }),
          headers,
        };
      }
      const tableName = process.env.ABSTRACT_PLAY_TABLE;
      if (!tableName) {
        return formatReturnError('ABSTRACT_PLAY_TABLE is not configured.');
      }
      if (await isDisplayNameTaken(ddbDocClient, tableName, validated.name, userId)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: DISPLAY_NAME_TAKEN_MESSAGE }),
          headers,
        };
      }
      attr = "name";
      val = validated.name;
      break;
    }
    case "language":
      attr = "language";
      val = pars.value;
      break;
    case "country":
      attr = "country";
      val = pars.value;
      break;
    case "bggid":
      attr = "bggid";
      val = pars.value;
      break;
    default:
      return;
  }
  console.log("attr, val: ", attr, val);
  const work = [];
  work.push(ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userId },
    ExpressionAttributeValues: { ":v": val },
    ExpressionAttributeNames: { "#a": attr },
    UpdateExpression: "set #a = :v"
  })));
  if (pars.attribute === "name") {
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USERS", "sk": userId },
      ExpressionAttributeValues: { ":newname": val },
      ExpressionAttributeNames: { "#name": "name" },
      UpdateExpression: "set #name = :newname"
    })));
  }
  if (pars.attribute === "country") {
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USERS", "sk": userId },
      ExpressionAttributeValues: { ":newcountry": val },
      ExpressionAttributeNames: { "#country": "country" },
      UpdateExpression: "set #country = :newcountry"
    })));
  }
  if (attr === "bggid" || attr === "about") {
    console.log(`Pushing USERS update: ${userId} -> ${attr} = ${val}`)
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USERS", "sk": userId },
      ExpressionAttributeValues: { ":v": val },
      ExpressionAttributeNames: { "#a": attr },
      UpdateExpression: "set #a = :v"
    })));
  }
  try {
    await Promise.all(work);
    console.log("attr, val: ", attr, val, " updated");
    return {
      statusCode: 200,
      body: JSON.stringify({
        "result": "success"
      }, Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
  }
}

export async function getChallenges(challengeIds: string[]) {
  const challenges: any[] = [];
  challengeIds.forEach((id: string) => {
    const ind = id.indexOf('#'); // neither metaGame ids, not guids can contain '#'s.
    if (ind > -1) {
      const metaGame = id.substring(0, ind);
      const challengeId = id.substring(ind + 1);
      challenges.push(
        ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "STANDINGCHALLENGE#" + metaGame,
              "sk": challengeId
            }
          })
        )
      );
    } else {
      challenges.push(
        ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "CHALLENGE",
              "sk": id
            }
          })
        )
      );
    }
  });
  return Promise.all(challenges);
}

async function getBots(botIds: string[]) {
  return Promise.all(botIds.map((clientId: string) =>
    ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          pk: "BOT",
          sk: clientId
        }
      })
    )
  ));
}

export async function newProfile(claim: PartialClaims, pars: { name: any; consent: any; anonymous: any; country: any; tagline: any; }) {
  const userid = claim.sub;
  const email = claim.email;
  const validatedName = validateUserDisplayName(pars.name);
  if (!validatedName.ok) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: validatedName.message }),
      headers,
    };
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE;
  if (!tableName) {
    return formatReturnError('ABSTRACT_PLAY_TABLE is not configured.');
  }
  if (await isDisplayNameTaken(ddbDocClient, tableName, validatedName.name, userid)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: DISPLAY_NAME_TAKEN_MESSAGE }),
      headers,
    };
  }
  if (!email || email.trim() === "") {
    logGetItemError(`No email for user ${pars.name}, id ${userid} in newProfile`);
    return formatReturnError(`No email for user ${pars.name}, id ${userid} in newProfile`);
  }
  const data = {
    "pk": "USER",
    "sk": userid,
    "id": userid,
    "name": validatedName.name,
    "email": email,
    "consent": pars.consent,
    "anonymous": pars.anonymous,
    "country": pars.country,
    "tagline": pars.tagline,
    "settings": {
      "all": {
        "annotate": true,
      }
    },
    "publicRivalries": false
  };
  // So that we can list all users
  const data2 = {
    "pk": "USERS",
    "sk": userid,
    "name": validatedName.name,
    "publicRivalries": false
  };
  try {
    const insertUser = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
    const insertIntoUserList = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data2
    }));
    await Promise.all([insertUser, insertIntoUserList]);
    console.log("Success - user added", data);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user profile for user ${pars.name}`,
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to store user profile for user ${pars.name}`);
  }
}

export async function setPush(userid: string, pars: { state: boolean }) {
  try {
    console.log(`Setting 'mayPush' to ${pars.state} for user ${userid}`);
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userid },
        ExpressionAttributeNames: { "#mp": "mayPush" },
        ExpressionAttributeValues: { ":mp": pars.state },
        UpdateExpression: "set #mp = :mp"
      })
    );
    if (pars.state === false) {
      await deleteAllPushSubscriptions(userid);
    }
  } catch (error) {
    logGetItemError(error);
    throw new Error("setPush: Failed to save push preference");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved push preference for ${userid}`,
    }),
    headers
  };
}

export async function savePush(userid: string, pars: { payload: any }) {
  if (pars.payload?.endpoint === undefined) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'savePush: missing payload.endpoint',
      }),
      headers
    };
  }
  try {
    console.log(`Attempting to save push notification credentials for user ${userid}:\n${JSON.stringify(pars.payload)}`);
    await savePushSubscription(userid, pars.payload);
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { pk: "USER", sk: userid },
        ExpressionAttributeNames: { "#mp": "mayPush" },
        ExpressionAttributeValues: { ":mp": true },
        UpdateExpression: "set #mp = :mp",
      })
    );
  } catch (error) {
    logGetItemError(error);
    throw new Error("savePush: Failed to save push notification credentials");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved push notifications credentials for ${userid}`,
    }),
    headers
  };
}

export async function deletePush(userid: string, pars: { endpoint?: string }) {
  const endpoint = pars.endpoint;
  if (endpoint === undefined || endpoint.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "deletePush: missing endpoint",
      }),
      headers,
    };
  }
  try {
    await deletePushSubscriptionByEndpoint(userid, endpoint);
    const remaining = await queryPushSubscriptions(userid);
    if (remaining.length === 0) {
      await ddbDocClient.send(
        new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { pk: "USER", sk: userid },
          ExpressionAttributeNames: { "#mp": "mayPush" },
          ExpressionAttributeValues: { ":mp": false },
          UpdateExpression: "set #mp = :mp",
        })
      );
    }
  } catch (error) {
    logGetItemError(error);
    throw new Error("deletePush: Failed to delete push subscription");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully deleted push subscription for ${userid}`,
    }),
    headers
  };
}

export async function saveTags(userid: string, pars: { payload: TagList[] }) {
  try {
    console.log(`Attempting to save tags for user ${userid}:\n${JSON.stringify(pars.payload)}`);
    if (pars.payload.length === 0) {
      await ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TAG", "sk": userid
          },
        })
      )
    } else {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "TAG",
          "sk": userid,
          "tags": pars.payload,
        }
      }));
    }
  } catch (error) {
    logGetItemError(error);
    throw new Error("saveTags: Failed to save tags");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved tags for ${userid}`,
    }),
    headers
  };
}

export async function saveCustomization(userid: string, pars: { metaGame: string; settings: Customization }) {
  try {
    // console.log(`Saving customization for user ${userid}, game ${pars.metaGame}:\n${JSON.stringify(pars.settings)}`);
    let settings = pars.settings as Customization | string;
    if (typeof settings === "string") {
      settings = JSON.parse(settings);
    }
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "CUSTOMIZATION#" + userid,
        "sk": pars.metaGame,
        "settings": settings,
      }
    }));
  } catch (error) {
    logGetItemError(error);
    throw new Error("saveCustomization: Failed to save customization");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully saved customization for ${userid}, ${pars.metaGame}`,
    }),
    headers
  };
}

export async function deleteCustomization(userid: string, pars: { metaGame: string }) {
  try {
    console.log(`Deleting customization for user ${userid}, game ${pars.metaGame}`);
    await ddbDocClient.send(new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "CUSTOMIZATION#" + userid,
        "sk": pars.metaGame,
      }
    }));
  } catch (error) {
    logGetItemError(error);
    throw new Error("deleteCustomization: Failed to delete customization");
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Successfully deleted customization for ${userid}, ${pars.metaGame}`,
    }),
    headers
  };
}
