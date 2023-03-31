'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, QueryCommandOutput, QueryCommandInput, ScanCommand } from '@aws-sdk/lib-dynamodb';
// import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory, GameBase } from '@abstractplay/gameslib';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import i18n from 'i18next';
import en from '../locales/en/translation.json';
import fr from '../locales/fr/translation.json';
import it from '../locales/it/translation.json';
import { EntropyGame } from '@abstractplay/gameslib/build/src/games';

const REGION = "us-east-1";
const sesClient = new SESClient({ region: REGION });
const clnt = new DynamoDBClient({ region: REGION });
const marshallOptions = {
  // Whether to automatically convert empty strings, blobs, and sets to `null`.
  convertEmptyValues: false, // false, by default.
  // Whether to remove undefined values while marshalling.
  removeUndefinedValues: true, // false, by default.
  // Whether to convert typeof object to map attribute.
  convertClassInstanceToMap: false, // false, by default.
};
const unmarshallOptions = {
  // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
  wrapNumbers: false, // false, by default.
};
const translateConfig = { marshallOptions, unmarshallOptions };
const ddbDocClient = DynamoDBDocumentClient.from(clnt, translateConfig);
const headers = {
  'content-type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// Types
type MetaGameCounts = {
  [metaGame: string]: {
    currentgames: number;
    completedgames: number;
    standingchallenges: number;
    ratings?: Set<string>;
  }
}

type Challenge = {
  metaGame: string;
  standing?: boolean;
  challenger: User; 
  players: User[];
  challengees?: User[]; 
}

type FullChallenge = {
  pk?: string,
  sk?: string,
  metaGame: string;
  numPlayers: number;
  standing?: boolean;
  seating: string;
  variants: string;
  challenger: User;
  challengees?: User[]; // players who were challenged
  players?: User[]; // players that have accepted
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
}

type User = {
  id: string;
  name: string;
  time?: number;
  settings?: any;
  draw?: string;
}

type FullUser = {
  pk?: string,
  sk?: string,
  id: string;
  name: string;
  email: string;
  games: Game[];
  challenges: {
    issued: string[];
    received: string[];
    accepted: string[];
    standing: string[];
  }
  admin: boolean | undefined;
  language: string;
  settings: any;
  ratings?: {
    [metaGame: string]: Rating
  };
}

type Rating = {
  rating: number;
  N: number;
  wins: number;
  draws: number;
}

type Game = {
  id : string;
  metaGame: string;
  players: User[];
  lastMoveTime: number;
  clockHard: boolean;
  toMove: string | boolean[];
  seen?: number;
}

type FullGame = {
  pk: string;
  sk: string;
  id: string;
  clockHard: boolean;
  clockInc: number;
  clockMax: number;
  clockStart: number;
  gameStarted: number;
  lastMoveTime: number;
  metaGame: string;
  numPlayers: number;
  players: User[];
  state: string;
  toMove: string | boolean[];
  partialMove?: string;
  winner?: number[];
  numMoves?: number;
  rated?: boolean;
}

type Comment = {
  comment: string;
  userId: string;
  moveNumber: number;
  timeStamp: number;
}

module.exports.query = async (event: { queryStringParameters: any; }) => {
  console.log(event);
  const pars = event.queryStringParameters;
  console.log(pars);
  switch (pars.query) {
    case "user_names":
      return await userNames();
    case "challenge_details":
      return await challengeDetails(pars);
    case "standing_challenges":
      return await standingChallenges(pars);
    case "games":
      return await games(pars);
    case "ratings":
      return await ratings(pars);
    case "meta_games":
      return await metaGamesDetails();
    case "get_game":
      return await game("", pars);  
    default:
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: `Unable to execute unknown query '${pars.query}'`
        }),
        headers
      };
  }
}

// It looks like there is no way to "run and forget", you need to finish all work before returning a response to the front end. :(
// Make sure the @typescript-eslint/no-floating-promises linter rule passes, otherwise promise might (at best?) only be fullfilled on the next call to the API...
module.exports.authQuery = async (event: { body: { query: any; pars: any; }; cognitoPoolClaims: { sub: any; email: any; }; }) => {
  console.log("authQuery: ", event.body.query);
  const query = event.body.query;
  const pars = event.body.pars;
  switch (query) {
    case "me":
      return await me(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email, pars);
    case "my_settings":
      return await mySettings(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email);
    case "new_setting":
      return await newSetting(event.cognitoPoolClaims.sub, pars);
    case "new_profile":
      return await newProfile(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email, pars);
    case "new_challenge":
      return await newChallenge(event.cognitoPoolClaims.sub, pars);
    case "challenge_revoke":
      return await revokeChallenge(event.cognitoPoolClaims.sub, pars);
    case "challenge_response":
      return await respondedChallenge(event.cognitoPoolClaims.sub, pars);
    case "submit_move":
      return await submitMove(event.cognitoPoolClaims.sub, pars);
    case "submit_comment":
      return await submitComment(event.cognitoPoolClaims.sub, pars);
    case "get_game":
      return await game(event.cognitoPoolClaims.sub, pars);
    case "update_game_settings":
      return await updateGameSettings(event.cognitoPoolClaims.sub, pars);
    case "update_user_settings":
      return await updateUserSettings(event.cognitoPoolClaims.sub, pars);
    case "update_meta_game_counts":
      return await updateMetaGameCounts(event.cognitoPoolClaims.sub);
    case "update_meta_game_ratings":
      return await updateMetaGameRatings(event.cognitoPoolClaims.sub);
    case "onetime_fix":
      return await onetimeFix(event.cognitoPoolClaims.sub);
    case "test_async":
      return await testAsync(event.cognitoPoolClaims.sub, pars);
    default:
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: `Unable to execute unknown query '${query}'`
        }),
        headers
      };
  }
}

async function userNames() {
  console.log("userNames: Scanning users.");
  try {
    const data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "USERS" },
        ExpressionAttributeNames: { "#pk": "pk", "#name": "name"},
        ProjectionExpression: "sk, #name",
        ReturnConsumedCapacity: "INDEXES"
      }));

    console.log("Query succeeded. Got:");
    console.log(data);
    const users = data.Items;
    if (users == undefined) {
      throw new Error("Found no users?");
    }
    return {
      statusCode: 200,
      body: JSON.stringify(users.map(u => ({"id": u.sk, "name": u.name}))),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to query table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function challengeDetails(pars: { id: string; }) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "CHALLENGE", "sk": pars.id
        },
      }));
    console.log("Got:");
    console.log(data);
    return {
      statusCode: 200,
      body: JSON.stringify(data.Item),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get challenge ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function games(pars: { metaGame: string, type: string; }) {
  const game = pars.metaGame;
  console.log(game);
  let type2: string;
  if (pars.type === "current") {
    type2 = "CURRENTGAMES";
  } else if (pars.type === "completed") {
    type2 = "COMPLETEDGAMES";
  } else {
    return formatReturnError(`Unknown type ${pars.type}`);
  }
  try {
    const gamesData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": type2 + "#" + game },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    return {
      statusCode: 200,
      body: JSON.stringify(gamesData.Items),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get games for ${pars.metaGame}`);
  }
}

async function ratings(pars: { metaGame: string }) {
  const game = pars.metaGame;
  try {
    const ratingsData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "RATINGS#" + game },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    return {
      statusCode: 200,
      body: JSON.stringify(ratingsData.Items),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get ratings for ${pars.metaGame}`);
  }
}

async function standingChallenges(pars: { metaGame: string; }) {
  const game = pars.metaGame;
  console.log(game);
  try {
    const challenges = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    return {
      statusCode: 200,
      body: JSON.stringify(challenges.Items),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get standing challenges for ${pars.metaGame}`);
  }
}

async function metaGamesDetails() {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "METAGAMES", "sk": "COUNTS"
        },
      }));
    const details = data.Item as MetaGameCounts;
    // Change every "ratings" to the number of elements in the Set.
    const details2 = Object.keys(details)
      .filter(key => key !== "pk" && key !== "sk")
      .reduce( (a, k) => ({...a, [k]: { ...details[k], "ratings" : details[k].ratings?.size ?? 0}}), {})
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

async function game(userid: string, pars: { id: string; }) {
  try {
    const getGame = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.id
        },
      }));
    const getComments = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMECOMMENTS",
          "sk": pars.id
        },
        ReturnConsumedCapacity: "INDEXES"
      }));
    const gameData = await getGame;
    console.log("Got:");
    console.log(gameData);
    const game = gameData.Item as FullGame;
    if (game === undefined)
      throw new Error(`Game ${pars.id} not found`);
    // If the game is over update user to indicate they have seen the game end.
    let work;
    if ((game.toMove === "" || game.toMove === null) && userid !== "") {
      work = setSeenTime(userid, pars.id);
    }
    // hide other player's simulataneous moves
    const flags = gameinfo.get(game.metaGame).flags;
    if (flags !== undefined && flags.includes('simultaneous') && game.partialMove !== undefined) {
      game.partialMove = game.partialMove.split(',').map((m: string, i: number) => (game.players[i].id === userid ? m : '')).join(',');
    }
    let comments = [];
    const commentData = await getComments;
    if (commentData.Item !== undefined && commentData.Item.comments)
      comments = commentData.Item.comments;
    await work;
    return {
      statusCode: 200,
      body: JSON.stringify({"game": game, "comments": comments}),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function updateGameSettings(userid: string, pars: { game: string; settings: any; }) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.game
        },
      }));
    console.log("Got:");
    console.log(data);
    const game = data.Item as Game;
    if (game === undefined)
      throw new Error(`updateGameSettings: game ${pars.game} not found`);
    const player = game.players.find((p: { id: any; }) => p.id === userid);
    if (player === undefined)
      throw new Error(`updateGameSettings: player ${userid} isn't playing in game ${pars.game}`);
    player.settings = pars.settings;
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: game
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

async function setSeenTime(userid: string, gameid: any) {
  let user: FullUser;
  try {
    const userData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userid
        },
      }));
    if (userData.Item === undefined)
      throw new Error(`setSeenTime, no user?? ${userid}`);
    user = userData.Item as FullUser;
  } catch (err) {
    logGetItemError(err);
    throw new Error(`setSeenTime, no user?? ${userid}`);
  }

  const games = user.games;
  const thegame = games.find((g: { id: any; }) => g.id == gameid);
  if (thegame !== undefined) {
    thegame.seen = Date.now();
  }
  return ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":gs": games },
    UpdateExpression: "set games = :gs",
  }));
}

async function updateUserSettings(userid: string, pars: { settings: any; }) {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      ExpressionAttributeValues: { ":ss": pars.settings },
      UpdateExpression: "set settings = :ss",
    }))
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

async function me(userId: string, email: any, pars: { size: string }) {
  const fixGames = false;
  try {
    const userData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER",
          "sk": userId
        },
      }));
    if (userData.Item === undefined) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    const user = userData.Item as FullUser;
    const work: Promise<any>[] = [];
    if (user.email !== email)
      work.push(updateUserEMail(userId, email));
    let games = user.games;
    if (games == undefined)
      games= [];
    if (fixGames) {
      console.log("games before", games);
      games = await getGamesForUser(userId);
      console.log("games after", games);
    }
    // Check for out-of-time games
    games.forEach((game: Game) => {
      if (game.clockHard && game.toMove !== '') {
        if (Array.isArray(game.toMove)) {
          let minTime = 0;
          let minIndex = -1;
          const elapsed = Date.now() - game.lastMoveTime;
          game.toMove.forEach((p: any, i: number) => {
            if (p && game.players[i].time! - elapsed < minTime) {
              minTime = game.players[i].time! - elapsed;
              minIndex = i;
            }});
          if (minIndex !== -1) {
            game.toMove = '';
            game.lastMoveTime = game.lastMoveTime + game.players[minIndex].time!;
            work.push(timeloss(minIndex, game.id, game.lastMoveTime));
          }
        } else {
          const toMove = parseInt(game.toMove);
          if (game.players[toMove].time! - (Date.now() - game.lastMoveTime) < 0) {
            game.lastMoveTime = game.lastMoveTime + game.players[toMove].time!;
            game.toMove = '';
            work.push(timeloss(toMove, game.id, game.lastMoveTime));
          }
        }
      }
    });
    // Check for "recently completed games"
    // As soon as a game is over move it to archive status (game.type = 0).
    // Remove the game from user's games list 48 hours after they have seen it. "Seen it" means they clicked on the game (or they were the one that caused the end of the game).
    // TODO: Put it back in their list if anyone comments.
    for (let i = games.length - 1; i >= 0; i-- ) { 
      if (games[i].toMove === "" || games[i].toMove === null ) {
        if (games[i].seen !== undefined && Date.now() - (games[i].seen || 0) > 48 * 3600000) {
          games.splice(i, 1);
        }
      }
    }
    let challengesIssuedIDs: string[] = [];
    let challengesReceivedIDs: string[] = [];
    let challengesAcceptedIDs: string[] = [];
    let standingChallengeIDs: string[] = [];
    if (user.challenges !== undefined) {
      if (user.challenges.issued !== undefined)
        challengesIssuedIDs = user.challenges.issued;
      if (user.challenges.received !== undefined)
        challengesReceivedIDs = user.challenges.received;
      if (user.challenges.accepted !== undefined)
        challengesAcceptedIDs = user.challenges.accepted;
      if (user.challenges.standing !== undefined)
        standingChallengeIDs = user.challenges.standing;
    }
    let data = null;
    if (!pars || !pars.size || pars.size !== "small") {
      const challengesIssued = getChallenges(challengesIssuedIDs);
      const challengesReceived = getChallenges(challengesReceivedIDs);
      const challengesAccepted = getChallenges(challengesAcceptedIDs);
      const standingChallenges = getChallenges(standingChallengeIDs);
      data = await Promise.all([challengesIssued, challengesReceived, challengesAccepted, standingChallenges]);
    }
    // Update last seen date for user
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userId },
      ExpressionAttributeValues: { ":dt": Date.now(), ":gs": games },
      UpdateExpression: "set lastSeen = :dt, games = :gs"
    })));
    await Promise.all(work);
    if (data) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          "id": user.id,
          "name": user.name,
          "admin": (user.admin === true),
          "language": user.language,
          "games": games,
          "settings": user.settings,
          "challengesIssued": data[0].map(d => d.Item),
          "challengesReceived": data[1].map(d => d.Item),
          "challengesAccepted": data[2].map(d => d.Item),
          "standingChallenges": data[3].map(d => d.Item)
        }, Set_toJSON),
        headers
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({
          "id": user.id,
          "name": user.name,
          "admin": (user.admin === true),
          "language": user.language,
          "games": games,
          "settings": user.settings
        }, Set_toJSON),
        headers
      }
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get user data for ${userId}`);
  }
}

async function updateUserEMail(userid: string, newMail: any) {
  return ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":e": newMail },
    UpdateExpression: "set email = :e",
  }));
}

async function mySettings(userId: string, email: any) {
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
      await updateUserEMail(userId, email);

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

async function newSetting(userId: string, pars: { attribute: string; value: string; }) {
  let attr = '';
  let val = '';
  switch (pars.attribute) {
    case "name":
      attr = "name";
      val = pars.value;
      break;
    case "language":
      attr = "language";
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

// This is expensive, so only use when things go belly up. E.g. if a game had to be deleted.
async function getGamesForUser(userId: any) {
  const games: Game[] = [];
  gameinfo.forEach(async (game) => {
    let result = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "CURRENTGAMES#" + game.uid },
        ExpressionAttributeNames: { "#pk": "pk" },
        ProjectionExpression: "id, players, metaGame, clockHard, toMove, lastMoveTime",
        Limit: 2   // For testing!
        }));
    console.log("result", result);
    processGames(userId, result, games);
    let last = result.LastEvaluatedKey;
    console.log("last", last);
    while (last !== undefined) {
      result = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "CURRENTGAMES#" + game.uid },
          ExpressionAttributeNames: { "#pk": "pk" },
          ProjectionExpression: "id, players, metaGame, clockHard, toMove, lastMoveTime",
          Limit: 2,   // For testing!
          ExclusiveStartKey: last
        }));
      processGames(userId, result, games);
      last = result.LastEvaluatedKey;
      console.log("result", result);
    }
  });
  return games;
}

function processGames(userid: any, result: QueryCommandOutput, games: Game[]) {
  if (result.Items === undefined)
    throw new Error("processGames: no games found!?");
  const fullGames = result.Items as FullGame[];
  fullGames.forEach((game: { players: any[]; id: any; metaGame: any; clockHard: any; toMove: any; lastMoveTime: any; }) => {
    if (game.players.some((p: { id: any; }) => p.id === userid)) {
      games.push({"id": game.id, "metaGame": game.metaGame, "players": game.players, "clockHard": game.clockHard, "toMove": game.toMove, "lastMoveTime": game.lastMoveTime});
    }
  });
}

async function getChallenges(challengeIds: string[]) {
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

async function newProfile(userid: string, email: any, pars: { name: any; consent: any; anonymous: any; country: any; tagline: any; }) {
  const data = {
      "pk": "USER",
      "sk": userid,
      "id": userid,
      "name": pars.name,
      "email": email,
      "consent": pars.consent,
      "anonymous": pars.anonymous,
      "country": pars.country,
      "tagline": pars.tagline,
      "challenges" : {},
      "settings": {
        "all": {
         "annotate": true,
         "color": "standard"
        }
      }
    };
  // So that we can list all users
  const data2 = {
    "pk": "USERS",
    "sk": userid,
    "name": pars.name
  };
  try {
    const insertUser =  ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
    const insertIntoUserList =  ddbDocClient.send(new PutCommand({
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

async function newChallenge(userid: string, challenge: FullChallenge) {
  console.log("newChallenge challenge:", challenge);
  if (challenge.standing) {
    return await newStandingChallenge(userid, challenge);
  }
  const challengeId = uuid();
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "CHALLENGE",
        "sk": challengeId,
        "id": challengeId,
        "metaGame": challenge.metaGame,
        "numPlayers": challenge.numPlayers,
        "standing": challenge.standing,
        "seating": challenge.seating,
        "variants": challenge.variants,
        "challenger": challenge.challenger,
        "challengees": challenge.challengees, // users that were challenged
        "players": [challenge.challenger], // users that have accepted
        "clockStart": challenge.clockStart,
        "clockInc": challenge.clockInc,
        "clockMax": challenge.clockMax,
        "clockHard": challenge.clockHard,
        "rated": challenge.rated
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": new Set([challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.issued :c",
  }));

  const list: Promise<any>[] = [addChallenge, updateChallenger];
  if (challenge.challengees !== undefined) {
    challenge.challengees.forEach((challengee: { id: string; }) => {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": challengee.id },
          ExpressionAttributeValues: { ":c": new Set([challengeId]) },
          ExpressionAttributeNames: { "#c": "challenges" },
          UpdateExpression: "add #c.received :c",
        }))
      );
    })
    try {
      list.push(sendChallengedEmail(challenge.challenger.name, challenge.challengees, challenge.metaGame));
    } catch (error) {
      logGetItemError(error);
      throw new Error("newChallenge: Failed to send emails");
    }
  }
  try {
    await Promise.all(list);
    console.log("Successfully added challenge" + challengeId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge",
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to add challenge");
  }
}

async function newStandingChallenge(userid: string, challenge: FullChallenge) {
  const challengeId = uuid();
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
        "sk": challengeId,
        "id": challengeId,
        "metaGame": challenge.metaGame,
        "numPlayers": challenge.numPlayers,
        "standing": challenge.standing,
        "seating": challenge.seating,
        "variants": challenge.variants,
        "challenger": challenge.challenger,
        "players": [challenge.challenger], // users that have accepted
        "clockStart": challenge.clockStart,
        "clockInc": challenge.clockInc,
        "clockMax": challenge.clockMax,
        "clockHard": challenge.clockHard,
        "rated": challenge.rated
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.standing :c",
  }));
  
  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);
  
  try {
    await Promise.all([addChallenge, updateChallenger, updateStandingChallengeCnt]);
    console.log("Successfully added challenge" + challengeId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge",
      }),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to add challenge");
  }
}

async function sendChallengedEmail(challengerName: string, opponents: User[], metaGame: string) {
  const players: FullUser[] = await getPlayers(opponents.map((o: { id: any; }) => o.id));
  console.log(players);
  metaGame = gameinfo.get(metaGame).name;
  await initi18n('en');
  const work: Promise<any>[] = [];
  for (const player of players) {
    await changeLanguageForPlayer(player);
    const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeSubject"), i18n.t("ChallengeBody", { "challenger": challengerName, metaGame, "interpolation": {"escapeValue": false} }));
    work.push(sesClient.send(comm));
  }
  return Promise.all(work);
}

async function revokeChallenge(userid: any, pars: { id: string; metaGame: string; standing: boolean; }) {
  let challenge: Challenge | undefined;
  const work: Promise<any>[] = [];
  let work1 : Promise<any> | undefined;
  try {
    ({challenge, work : work1} = await removeChallenge(pars.id, pars.metaGame, pars.standing === true, true, userid));
  } catch (err) {
    logGetItemError(err);
    return formatReturnError("Failed to remove challenge");
  }
  if (work1 !== undefined)
    work.push(work1);
  // send e-mails
  if (challenge) {
    const metaGame = gameinfo.get(challenge.metaGame).name;
    await initi18n('en');
    // Inform challenged
    if (challenge.challengees) {
      const players: FullUser[] = await getPlayers(challenge.challengees.map((c: { id: any; }) => c.id));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame, "interpolation": {"escapeValue": false}}));
        work.push(sesClient.send(comm));
      }
    }
    // Inform players that have already accepted
    if (challenge.players) {
      const players = await getPlayers(challenge.players.map((c: { id: any; }) => c.id).filter((id: any) => id !== challenge!.challenger.id));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame, "interpolation": {"escapeValue": false}}));
        work.push(sesClient.send(comm));
      }
    }
  }

  await Promise.all(work);
  console.log("Successfully removed challenge" + pars.id);
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Successfully removed challenge" + pars.id
    }),
    headers
  };
}

async function respondedChallenge(userid: string, pars: { response: boolean; id: string; standing?: boolean; metaGame: string; }) {
  const response = pars.response;
  const challengeId = pars.id;
  const standing = pars.standing === true;
  const metaGame = pars.metaGame;
  let ret: any;
  const work: Promise<any>[] = [];
  if (response) {
    // challenge was accepted
    let email;
    try {
      email = await acceptChallenge(userid, metaGame, challengeId, standing);
      console.log("Challenge" + challengeId + "successfully accepted.");
      ret = {
        statusCode: 200,
        body: JSON.stringify({
          message: "Challenge " + challengeId + " successfully accepted."
        }),
        headers
      };
    } catch (err) {
      logGetItemError(err);
      return formatReturnError("Failed to accept challenge");
    }
    if (email !== undefined) {
      console.log(email);
      await initi18n('en');
      try {
        for (const [ind, player] of email.players.entries()) {
          await changeLanguageForPlayer(player);
          console.log(player);
          let body = i18n.t("GameStartedBody", { metaGame: email.metaGame, "interpolation": {"escapeValue": false} });
          if (ind === 0 || email.simultaneous) {
            body += " " + i18n.t("YourMove");
          }
          const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameStartedSubject"), body);
          work.push(sesClient.send(comm));
        }
      } catch (err) {
        logGetItemError(err);
      }
    }
  } else {
    // challenge was rejected
    let challenge: Challenge | undefined;
    let work2: Promise<any> | undefined;
    try {
      ({challenge, work: work2} = await removeChallenge(pars.id, pars.metaGame, standing, false, userid));
      await work2;
      console.log("Successfully removed challenge " + pars.id);
      ret = {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully removed challenge " + pars.id
        }),
        headers
      };
    } catch (err) {
      logGetItemError(err);
      return formatReturnError("Failed to remove challenge");
    }
    // send e-mails
    console.log(challenge);
    if (challenge !== undefined) {
      await initi18n('en');
      // Inform everyone (except the decliner, he knows).
      const players: FullUser[] = await getPlayers(challenge.challengees!.map(c => c.id).filter(id => id !== userid).concat(challenge.players.map(c => c.id)));
      const quitter = challenge.challengees!.find(c => c.id === userid)!.name;
      const metaGame = gameinfo.get(challenge.metaGame).name;
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRejectedSubject"), i18n.t("ChallengeRejectedBody", { quitter, metaGame, "interpolation": {"escapeValue": false} }));
        work.push(sesClient.send(comm));
      }
    }
  }
  await Promise.all(work);
  return ret;
}

async function removeChallenge(challengeId: string, metaGame: string, standing: boolean, revoked: boolean, quitter: string) {
  const chall = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE",
        "sk": challengeId
      },
    }));
  if (chall.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return {"challenge": undefined, "work": undefined};
  }
  const challenge = chall.Item as Challenge;
  if (revoked && challenge.challenger.id !== quitter)
    throw new Error(`${quitter} tried to revoke a challenge that they did not create.`);
  if (!revoked && !(challenge.players.find((p: { id: any; }) => p.id === quitter) || (!standing && challenge.challengees!.find((p: { id: any; }) => p.id === quitter))))
    throw new Error(`${quitter} tried to leave a challenge that they are not part of.`);
  return {challenge, "work": removeAChallenge(challenge, standing, revoked, false, quitter)};
}

// Remove the challenge either because the game has started, or someone withrew: either challenger revoked the challenge or someone withdrew an acceptance, or didn't accept the challenge.
async function removeAChallenge(challenge: { [x: string]: any; challenger?: any; id?: any; challengees?: any; numPlayers?: any; metaGame?: any; players?: any; }, standing: any, revoked: boolean, started: boolean, quitter: string) {
  const list: Promise<any>[] = [];
  if (!standing) {
    // Remove from challenger
    const updateChallenger = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      ExpressionAttributeValues: { ":c": new Set([challenge.id]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.issued :c",
    }));
    list.push(updateChallenger);
    // Remove from challenged
    challenge.challengees.forEach((challengee: { id: string; }) => {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": challengee.id },
          ExpressionAttributeValues: { ":c": new Set([challenge.id]) },
          ExpressionAttributeNames: { "#c": "challenges" },
          UpdateExpression: "delete #c.received :c",
        }))
      );
    })  
  } else if (
      revoked 
      || challenge.numPlayers > 2 // Had to duplicate the standing challenge when someone accepted but there were still spots left. Remove the duplicated standing challenge
      ) {
    // Remove from challenger
    console.log(`removing duplicated challenge ${standing ? challenge.metaGame + '#' + challenge.id : challenge.id} from challenger ${challenge.challenger.id}`);
    const updateChallenger = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challenge.id]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.standing :c",
    }));
    list.push(updateChallenger);
  }

  // Remove from players that have already accepted
  let playersToUpdate = [];
  if (standing || revoked || started) {
    playersToUpdate = challenge.players.filter((p: { id: any; }) => p.id != challenge.challenger.id);
  } else {
    playersToUpdate = [{"id": quitter}];
  }
  playersToUpdate.forEach((player: { id: string; }) => {
    console.log(`removing challenge ${standing ? challenge.metaGame + '#' + challenge.id : challenge.id} from ${player.id}`);
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":c": new Set([standing ? challenge.metaGame + '#' + challenge.id : challenge.id]) },
        ExpressionAttributeNames: { "#c": "challenges" },
        UpdateExpression: "delete #c.accepted :c",
      }))
    );
  });

  // Remove challenge
  if (!standing) {
    list.push(
      ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "CHALLENGE", "sk": challenge.id
          },
        }))
    );
  } else if (
    revoked 
    || challenge.numPlayers > 2 // Had to duplicate the standing challenge when someone accepted but there were still spots left. Remove the duplicated standing challenge
  ) {
    list.push(
      ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "STANDINGCHALLENGE#" + challenge.metaGame, "sk": challenge.id
          },
        }))
    );

    list.push(updateStandingChallengeCount(challenge.metaGame, -1));
  }
  return Promise.all(list);
}

async function updateStandingChallengeCount(metaGame: any, diff: number) {
  return ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "METAGAMES", "sk": "COUNTS" },
    ExpressionAttributeNames: { "#g": metaGame },
    ExpressionAttributeValues: {":n": diff},
    UpdateExpression: "add #g.standingchallenges :n",
  }));
}

async function acceptChallenge(userid: string, metaGame: string, challengeId: string, standing: boolean) {
  const challengeData = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE", "sk": challengeId
      },
    }));

  if (challengeData.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return;
  }

  const challenge = challengeData.Item as FullChallenge;
  const challengees = standing || !challenge.challengees ? [] : challenge.challengees.filter((c: { id: any; }) => c.id != userid);
  if (!standing && challengees.length !== (challenge.challengees ? challenge.challengees.length : 0) - 1) {
    logGetItemError(`userid ${userid} wasn't a challengee, challenge ${challengeId}`);
    throw new Error("Can't accept a challenge if you weren't challenged");
  }
  const players = challenge.players;
  if ((players ? players.length : 0) === challenge.numPlayers - 1) {
    // Enough players accepted. Start game.
    const gameId = uuid();
    let playerIDs: string[] = [];
    if (challenge.seating === 'random') {
      playerIDs = players!.map(player => player.id) as string[];
      playerIDs.push(userid);
      shuffle(playerIDs);
    } else if (challenge.seating === 's1') {
      playerIDs.push(challenge.challenger.id);
      playerIDs.push(userid);
    } else if (challenge.seating === 's2') {
      playerIDs.push(userid);
      playerIDs.push(challenge.challenger.id);
    }
    const playersFull = await getPlayers(playerIDs);
    let whoseTurn: string | boolean[] = "0";
    const info = gameinfo.get(challenge.metaGame);
    if (info.flags !== undefined && info.flags.includes('simultaneous')) {
      whoseTurn = playerIDs.map(() => true);
    }
    const variants = challenge.variants;
    let engine;
    if (info.playercounts.length > 1)
      engine = GameFactory(challenge.metaGame, challenge.numPlayers, undefined, variants);
    else
      engine = GameFactory(challenge.metaGame, undefined, variants);
    if (!engine)
      throw new Error(`Unknown metaGame ${challenge.metaGame}`);
    const state = engine.serialize();
    const now = Date.now();
    const gamePlayers = playersFull.map(p => { return {"id": p.id, "name": p.name, "time": challenge.clockStart * 3600000 }}) as User[];
    if (info.flags !== undefined && info.flags.includes('perspective')) {
      let rot = 180;
      if (playerIDs.length > 2 && info.flags !== undefined && info.flags.includes('rotate90')) {
        rot = 90;
      }
      for (let i = 1; i < playerIDs.length; i++) {
        gamePlayers[i].settings = {"rotate": i * rot};
      }
    }
    const addGame = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAME",
          "sk": gameId,
          "id": gameId,
          "metaGame": challenge.metaGame,
          "numPlayers": challenge.numPlayers,
          "rated": challenge.rated === true,
          "players": gamePlayers,
          "clockStart": challenge.clockStart,
          "clockInc": challenge.clockInc,
          "clockMax": challenge.clockMax,
          "clockHard": challenge.clockHard,
          "state": state,
          "toMove": whoseTurn,
          "lastMoveTime": now,
          "gameStarted": now
        }
      }));
    // this should be all the info we want to show on the "my games" summary page.
    const game = {
      "id": gameId,
      "metaGame": challenge.metaGame,
      "players": playersFull.map(p => {return {"id": p.id, "name": p.name, "time": challenge.clockStart * 3600000}}),
      "clockHard": challenge.clockHard,
      "toMove": whoseTurn,
      "lastMoveTime": now,
    } as Game;
    const list: Promise<any>[] = [];
    list.push(addToGameLists("CURRENTGAMES", game, now));
  
    // Now remove the challenge and add the game to all players
    list.push(addGame);
    list.push(removeAChallenge(challenge, standing, false, true, ''));

    // Update players
    playersFull.forEach(player => {
      let games = player.games;
      if (games === undefined)
        games = [];
      games.push(game);
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": player.id },
          ExpressionAttributeValues: { ":gs": games },
          UpdateExpression: "set games = :gs",
        }))
      );
    });
    try {
      await Promise.all(list);
      return { metaGame: info.name, players: playersFull, simultaneous: info.flags !== undefined && info.flags.includes('simultaneous') };
    }
    catch (error) {
      logGetItemError(error);
      throw new Error('Unable to update players and create game');
    }
  } else {
    // Still waiting on more players to accept.
    // Update challenge
    let newplayer: User | undefined;
    if (standing) {
      const playerFull = await getPlayers([userid]);
      newplayer = {"id" : playerFull[0].id, "name": playerFull[0].name };
    } else {
      newplayer = challenge.challengees!.find(c => c.id == userid);
      if (!newplayer)
        throw new Error("Can't accept a challenge if you weren't challenged");
    }
    let updateChallenge: Promise<any>;
    if (!standing || challenge.numPlayers == 2 || (players && players.length !== 1)) {
      challenge.challengees = challengees;
      players!.push(newplayer);
      updateChallenge = ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: challenge
        }));
    } else {
      // need to duplicate the challenge, because numPlayers > 2 and we have our first accepter
      ({challengeId, work: updateChallenge} = await duplicateStandingChallenge(challenge, newplayer));
    }
    // Update accepter
    const updateAccepter = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      ExpressionAttributeValues: { ":c": new Set([standing ? challenge.metaGame + '#' + challengeId : challengeId]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.received :c add #c.accepted :c",
    }));

    await Promise.all([updateChallenge, updateAccepter]);
    return;
  }
}

async function duplicateStandingChallenge(challenge: { [x: string]: any; metaGame?: any; numPlayers?: any; standing?: any; seating?: any; variants?: any; challenger?: any; clockStart?: any; clockInc?: any; clockMax?: any; clockHard?: any; rated?: any; }, newplayer: any) {
  const challengeId = uuid();
  console.log("Duplicate challenge with newplayer", newplayer);
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "STANDINGCHALLENGE#" + challenge.metaGame,
        "sk": challengeId,
        "id": challengeId,
        "metaGame": challenge.metaGame,
        "numPlayers": challenge.numPlayers,
        "standing": challenge.standing,
        "seating": challenge.seating,
        "variants": challenge.variants,
        "challenger": challenge.challenger,
        "players": [challenge.challenger, newplayer], // users that have accepted
        "clockStart": challenge.clockStart,
        "clockInc": challenge.clockInc,
        "clockMax": challenge.clockMax,
        "clockHard": challenge.clockHard,
        "rated": challenge.rated
      }
    }));
  
  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);
  
  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": challenge.challenger.id },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.standing :c",
  }));
    
  return {challengeId, "work": Promise.all([addChallenge, updateStandingChallengeCnt, updateChallenger])};
}

async function getPlayers(playerIDs: string[]) {
  const list = playerIDs.map((id: string) =>
    ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER", "sk": id
        },
      })
    )
  );
  const players = await Promise.all(list);
  return players.map(player => player.Item as FullUser);
}

function addToGameLists(type: string, game: Game, now: number) {
  const work: Promise<any>[] = [];
  const sk = now + "#" + game.id;
  work.push(ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": type,
        "sk": sk,
        ...game}
    })));
  work.push(ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": type + "#" + game.metaGame,
        "sk": sk,
        ...game}
    })));
  game.players.forEach((player: { id: string; }) => {
    work.push(ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": type + "#" + player.id,
          "sk": sk,
          ...game}
      })));
    work.push(ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": type + "#" + game.metaGame + "#" + player.id,
          "sk": sk,
          ...game}
      })));
  });
  if (type === "CURRENTGAMES")
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: {":n": 1},
      UpdateExpression: "add #g.currentgames :n"
    })));
  else
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: {":n": 1},
      UpdateExpression: "add #g.completedgames :n"
    })));
  return Promise.all(work);
}

function removeFromGameLists(type: string, metaGame: string, gameStarted: number, id: string, players: any[]) {
  const work: Promise<any>[] = [];
  const sk = gameStarted + "#" + id;
  console.log("sk", sk);
  work.push(ddbDocClient.send(new DeleteCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: {
      "pk": type, "sk": sk
    }
  })));
  work.push(ddbDocClient.send(new DeleteCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: {
      "pk": type + "#" + metaGame, "sk": sk
    }
  })));
  players.forEach((player: { id: string; }) => {
    work.push(ddbDocClient.send(new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": type + "#" + player.id, "sk": sk
      }
    })));
    work.push(ddbDocClient.send(new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
          "pk": type + "#" + metaGame + "#" + player.id, "sk": sk
      }
    })));
  });
  if (type === "CURRENTGAMES")
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": metaGame },
      ExpressionAttributeValues: {":n": -1},
      UpdateExpression: "add #g.currentgames :n"
    })));
  else
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": metaGame },
      ExpressionAttributeValues: {":n": -1},
      UpdateExpression: "add #g.completedgames :n"
    })));

  return Promise.all(work);
}

async function submitMove(userid: string, pars: { id: string; move: string; draw: string; }) {
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.id
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  const game = data.Item as FullGame;
  console.log("got game in submitMove:");
  console.log(game);
  const engine = GameFactory(game.metaGame, game.state);
  if (!engine)
    throw new Error(`Unknown metaGame ${game.metaGame}`);
  const flags = gameinfo.get(game.metaGame).flags;
  const simultaneous = flags !== undefined && flags.includes('simultaneous');
  const lastMoveTime = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();
  try {
    if (pars.move === "resign") {
      resign(userid, engine, game);
    } else if (pars.move === "timeout") {
      timeout(userid, engine, game);
    } else if (pars.move === "" && pars.draw === "drawaccepted"){
      drawaccepted(userid, engine, game, simultaneous);
    } else if (simultaneous) {
      applySimultaneousMove(userid, pars.move, engine, game);
    } else {
      applyMove(userid, pars.move, engine, game);
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to apply move ${pars.move}`);
  }

  const player = game.players.find(p => p.id === userid);
  if (!player)
    throw new Error(`Player ${userid} isn't playing in game ${pars.id}`)
  // deal with draw offers
  if (pars.draw === "drawoffer") {
    player.draw = "offered";
  } else {
    // if a player just moved, other draw offers are declined
    game.players.forEach(p => delete p.draw);
  }
  const timestamp = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();
  const timeUsed = timestamp - lastMoveTime;
  // console.log("timeUsed", timeUsed);
  // console.log("player", player);
  if (player.time! - timeUsed < 0)
    player.time = game.clockInc * 3600000; // If the opponent didn't claim a timeout win, and player moved, pretend his remaining time was zero.
  else
    player.time = player.time! - timeUsed + game.clockInc * 3600000;
  if (player.time > game.clockMax  * 3600000) player.time = game.clockMax * 3600000;
  // console.log("players", game.players);
  const playerIDs = game.players.map((p: { id: any; }) => p.id);
  // TODO: We are updating players and their games. This should be put in some kind of critical section!
  const players = await getPlayers(playerIDs);

  // this should be all the info we want to show on the "my games" summary page.
  const playerGame = {
    "id": game.id,
    "metaGame": game.metaGame,
    "players": game.players,
    "clockHard": game.clockHard,
    "toMove": game.toMove,
    "lastMoveTime": timestamp
  } as Game;
  const myGame = {
    "id": game.id,
    "metaGame": game.metaGame,
    "players": game.players,
    "clockHard": game.clockHard,
    "toMove": game.toMove,
    "lastMoveTime": timestamp
  } as Game;
  const list: Promise<any>[] = [];
  let newRatings: {[metaGame: string] : Rating}[] | null = null;
  if ((game.toMove === "" || game.toMove === null)) {
    newRatings = updateRatings(game, players);
    myGame.seen = Date.now();
    if (game.numMoves && game.numMoves > game.numPlayers)
      list.push(addToGameLists("COMPLETEDGAMES", playerGame, timestamp));
    list.push(removeFromGameLists("CURRENTGAMES", game.metaGame, game.gameStarted, game.id, game.players));
  }
  game.lastMoveTime = timestamp;
  const updateGame = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: game
    }));
  list.push(updateGame);
  // Update players
  players.forEach((player, ind) => {
    const games: Game[] = [];
    player.games.forEach(g => {
      if (g.id === playerGame.id) {
        if (player.id === userid)
          games.push(myGame);
        else
          games.push(playerGame);
      }
      else
        games.push(g)
    });
    if (newRatings === null) {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": player.id },
          ExpressionAttributeValues: { ":gs": games },
          UpdateExpression: "set games = :gs",
        }))
      );
    } else {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": player.id },
          ExpressionAttributeValues: { ":gs": games, ":rs": newRatings[ind] },
          UpdateExpression: "set games = :gs, ratings = :rs"
        }))
      );

      list.push(ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: { 
          "pk": "RATINGS#" + game.metaGame,
          "sk": player.id,
          "id": player.id,
          "name": player.name,
          "rating": newRatings[ind][game.metaGame]
        }
      })));
        
      list.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "METAGAMES", "sk": "COUNTS" },
        ExpressionAttributeNames: { "#g": game.metaGame },
        ExpressionAttributeValues: {":p": new Set([player.id])},
        UpdateExpression: "add #g.ratedplayers :p",
      })));
    }
  });

  if (simultaneous)
    game.partialMove = game.players.map((p: User, i: number) => (p.id === userid ? game.partialMove!.split(',')[i] : '')).join(',');

  list.push(sendSubmittedMoveEmails(game, players, simultaneous, newRatings));
  await Promise.all(list);
  return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
}

function updateRatings(game: FullGame, players: FullUser[]) {
  console.log("game.numMoves", game.numMoves);
  if (!game.rated || (game.numMoves && game.numMoves <= game.numPlayers))
    return null;
  if (game.numPlayers !== 2)
    throw new Error(`Only 2 player games can be rated, game ${game.id}`);
  let rating1: Rating = {rating: 1200, N: 0, wins: 0, draws: 0}
  let rating2: Rating = {rating: 1200, N: 0, wins: 0, draws: 0}
  if (players[0].ratings !== undefined && players[0].ratings[game.metaGame] !== undefined)
    rating1 = players[0].ratings[game.metaGame];
  if (players[1].ratings !== undefined && players[1].ratings[game.metaGame] !== undefined)
    rating2 = players[1].ratings[game.metaGame];
  let score;
  if (Array.isArray(game.winner)) {
    if (game.winner.length == 1) {
      if (game.winner[0] === 1) {
        score = 1;
        rating1.wins += 1;
      } else if (game.winner[0] === 2) {
        score = 0;
        rating2.wins += 1;
      } else {
        throw new Error(`Winner ([${game.winner[0]}]) not in expected format, game ${game.id}`);
      }
    } else if (game.winner.length == 2) {
      if (game.winner.includes(1) && game.winner.includes(2)) {
        score = 0.5;
        rating1.draws += 1;
        rating2.draws += 1;
      } else {
        throw new Error(`Winner ([${game.winner[0]}, ${game.winner[1]}]) not in expected format, game ${game.id}`);
      }
    } else {
      throw new Error(`Winner has length ${game.winner.length}, this is not expected, game ${game.id}`);
    }
  } else {
    throw new Error(`Winner is not an array!? Game ${game.id}`);
  }
  const expectedScore = 1 / (1 + Math.pow(10, (rating2.rating - rating1.rating) / 400)); // player 1's expected score;
  const E2 = 1 / (1 + Math.pow(10, (rating1.rating - rating2.rating) / 400));
  console.log(`E = ${expectedScore}, E2 = ${E2}`);
  rating1.rating += getK(rating1.N) * (score - expectedScore);
  rating2.rating += getK(rating2.N) * (expectedScore - score);
  rating1.N += 1;
  rating2.N += 1;
  const ratings1 = players[0].ratings === undefined ? {} : players[0].ratings;
  const ratings2 = players[1].ratings === undefined ? {} : players[1].ratings;
  ratings1[game.metaGame] = rating1;
  ratings2[game.metaGame] = rating2;
  return [ratings1, ratings2];
}

function getK(N: number) {
  return (
    N < 10 ? 40 
    : N < 20 ? 30 
    : N < 40 ? 25 
    : 20
  );
}

async function sendSubmittedMoveEmails(game: FullGame, players0: any[], simultaneous: any, newRatings: any[] | null) {
  await initi18n('en');
  const work: Promise<any>[] =  [];
  if (game.toMove !== '') {
    let playerIds: any[] = [];
    if (!simultaneous) {
      playerIds.push(game.players[parseInt(game.toMove as string)].id);
    }
    else if ((game.toMove as boolean[]).every(b => b === true)) {
      playerIds = game.players.map(p => p.id);
    }
    const players = players0.filter(p => playerIds.includes(p.id));
    const metaGame = gameinfo.get(game.metaGame).name;
    for (const player of players) {
      await changeLanguageForPlayer(player);
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("YourMoveSubject"), i18n.t("YourMoveBody", { metaGame, "interpolation": {"escapeValue": false} }));
      work.push(sesClient.send(comm));
    }
  } else {
    // Game over
    const playerIds = game.players.map((p: { id: any; }) => p.id);
    const players = players0.filter((p: { id: any; }) => playerIds.includes(p.id));
    const metaGame = gameinfo.get(game.metaGame).name;
    for (const [ind, player] of players.entries()) {
      await changeLanguageForPlayer(player);
      let body;
      if (newRatings != null)
        body = i18n.t("GameOverWithRatingBody", { metaGame, "rating" : `${Math.round(newRatings[ind][game.metaGame].rating)}`, "interpolation": {"escapeValue": false} });
      else
        body = i18n.t("GameOverBody", { metaGame, "interpolation": {"escapeValue": false} });
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameOverSubject"), body);
      work.push(sesClient.send(comm));
    }
  }
  return Promise.all(work);
}

function resign(userid: any, engine: GameBase, game: FullGame) {
  const player = game.players.findIndex((p: { id: any; }) => p.id === userid);
  if (player === undefined)
    throw new Error(`${userid} isn't playing in this game!`);
  engine.resign(player + 1);
  game.state = engine.serialize();
  game.toMove = "";
  game.winner = engine.winner;
  game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
}

function timeout(userid: string, engine: GameBase, game: FullGame) {
  if (game.toMove === '')
    throw new Error("Can't timeout a game that has already ended");
  // Find player that timed out
  let loser: number;
  if (Array.isArray(game.toMove)) {
    let minTime = 0;
    let minIndex = -1;
    const elapsed = Date.now() - game.lastMoveTime;
    game.toMove.forEach((p: any, i: number) => {
      if (p && game.players[i].time! - elapsed < minTime) {
        minTime = game.players[i].time! - elapsed;
        minIndex = i;
      }});
    if (minIndex !== -1) {
      loser = minIndex;
    } else {
      throw new Error("Nobody's time is up!");
    }
  } else {
    if (game.players[parseInt(game.toMove)].time! - (Date.now() - game.lastMoveTime) < 0) {
      loser = parseInt(game.toMove);
    } else {
      throw new Error("Opponent's time isn't up!");
    }
  }
  engine.timeout(loser + 1);
  game.state = engine.serialize();
  game.toMove = "";
  game.winner = engine.winner;
  game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
}

function drawaccepted(userid: string, engine: GameBase, game: FullGame, simultaneous: boolean) {
  if ((!simultaneous && game.players[parseInt(game.toMove as string)].id !== userid) || (simultaneous && !game.players.some((p: User, i: number) => game.toMove[i] && p.id === userid))) {
    throw new Error('It is not your turn!');
  }
  const player = game.players.find((p: { id: any; }) => p.id === userid);
  if (!player)
    throw new Error("You can't accept a draw in a game you aren't playig in!");
  player.draw = "accepted";
  if (game.players.every(p => p.draw === "offered" || p.draw === "accepted")) {
    engine.draw();
    game.state = engine.serialize();
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  }
}

async function timeloss(player: number, gameid: string, timestamp: number) {
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": gameid
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    throw new Error(`Unable to get game ${gameid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);

  const game = data.Item as FullGame;
  const engine = GameFactory(game.metaGame, game.state);
  if (!engine)
    throw new Error(`Unknown metaGame ${game.metaGame}`);
  engine.timeout(player + 1);
  game.state = engine.serialize();
  game.toMove = "";
  game.winner = engine.winner;
  game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  game.lastMoveTime = timestamp;
  const playerIDs = game.players.map((p: { id: any; }) => p.id);
  // TODO: We are updating players and their games. TODO: implement optimistic locking
  const players = await getPlayers(playerIDs);

  // this should be all the info we want to show on the "my games" summary page.
  const playerGame = {
    "id": game.id,
    "metaGame": game.metaGame,
    "players": game.players,
    "clockHard": game.clockHard,
    "toMove": game.toMove,
    "lastMoveTime": game.lastMoveTime
  } as Game;
  const work: Promise<any>[] = [];
  work.push(ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: game
    })));
  if (game.numMoves && game.numMoves > game.numPlayers)
    work.push(addToGameLists("COMPLETEDGAMES", playerGame, game.lastMoveTime));
  work.push(removeFromGameLists("CURRENTGAMES", game.metaGame, game.gameStarted, game.id, game.players));
  const newRatings = updateRatings(game, players);

  // Update players
  players.forEach((player, ind) => {
    const games: Game[] = [];
    player.games.forEach(g => {
      if (g.id === playerGame.id)
        games.push(playerGame);
      else
        games.push(g)
    });
    if (newRatings === null) {
      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":gs": games },
        UpdateExpression: "set games = :gs"
      })));
    } else {
      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":gs": games, ":rs": newRatings[ind] },
        UpdateExpression: "set games = :gs, ratings = :rs"
      })));

      work.push(ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: { 
          "pk": "RATINGS#" + game.metaGame,
          "sk": player.id,
          "id": player.id,
          "name": player.name,
          "rating": newRatings[ind][game.metaGame]
        }
      })));

      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "METAGAMES", "sk": "COUNTS" },
        ExpressionAttributeNames: { "#g": game.metaGame },
        ExpressionAttributeValues: {":p": new Set([player.id])},
        UpdateExpression: "add #g.ratedplayers :p",
      })));
    }
  });
  return Promise.all(work);
}

function applySimultaneousMove(userid: string, move: string, engine: GameBase, game: FullGame) {
  const partialMove = game.partialMove;
  const moves = partialMove === undefined ? game.players.map(() => '') : partialMove.split(',');
  let cnt = 0;
  let found = false;
  for (let i = 0; i < game.numPlayers; i++) {
    if (game.players[i].id === userid) {
      found = true;
      if (moves[i] !== '' || !game.toMove[i]) {
        throw new Error('You have already submitted your move for this turn!');
      }
      moves[i] = move;
      (game.toMove as boolean[])[i] = false;
    }
    if (moves[i] !== '')
      cnt++;
  }
  if (!found) {
    throw new Error('You are not participating in this game!');
  }
  if (cnt < game.numPlayers) {
    // not a complete "turn" yet, just validate and save the new partial move
    game.partialMove = moves.join(',');
    console.log(game.partialMove);
    if (game.metaGame === "entropy") // need to fix this...
      (engine as EntropyGame).move(game.partialMove, true);
    else
      engine.move(game.partialMove);
  }
  else {
    // full move.
    engine.move(moves.join(','));
    game.state = engine.serialize();
    game.partialMove = game.players.map(() => '').join(',');
    if (engine.gameover) {
      game.toMove = "";
      game.winner = engine.winner;
      game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
    }
    else
      game.toMove = game.players.map(() => true);
  }
}

function applyMove(userid: string, move: string, engine: GameBase, game: FullGame) {
  // non simultaneous move game.
  if (game.players[parseInt(game.toMove as string)].id !== userid) {
    throw new Error('It is not your turn!');
  }
  console.log("applyMove", move);
  engine.move(move);
  console.log("applied");
  game.state = engine.serialize();
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  }
  else
    game.toMove = `${(parseInt(game.toMove as string) + 1) % game.players.length}`;
  console.log("done");
}

async function submitComment(userid: string, pars: { id: string; comment: string; moveNumber: number; }) {
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMECOMMENTS",
          "sk": pars.id
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get comments for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const commentsData = data.Item;
  console.log("got comments in submitComment:");
  console.log(commentsData);
  let comments: Comment[];
  if (commentsData === undefined)
    comments= []
  else
    comments = commentsData.comments;

  if (comments.reduce((s: number, a: Comment) => s + 110 + Buffer.byteLength(a.comment,'utf8'), 0) < 360000) {
    const comment: Comment = {"comment": pars.comment.substring(0, 4000), "userId": userid, "moveNumber": pars.moveNumber, "timeStamp": Date.now()};
    comments.push(comment);
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAMECOMMENTS",
          "sk": pars.id,
          "comments": comments
        }
      }));
  }
}

async function updateMetaGameCounts(userId: string) {
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

    const metaGamesDataWork = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "METAGAMES", "sk": "COUNTS"
        },
      }));

    const games: string[] = [];
    gameinfo.forEach((game) => games.push(game.uid));
    const currentgames = games.map(game => ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "CURRENTGAMES#" + game },
          ExpressionAttributeNames: { "#pk": "pk" }
        })));
    const completedgames = games.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game },
        ExpressionAttributeNames: { "#pk": "pk" }
      })));
    const standingchallenges = games.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
        ExpressionAttributeNames: { "#pk": "pk" }
      })));

    const metaGamesData = await metaGamesDataWork;
    let metaGameCounts: MetaGameCounts;
    if (metaGamesData.Item === undefined)
      metaGameCounts = {};
    else
      metaGameCounts = metaGamesData.Item as MetaGameCounts;
  
    const work = await Promise.all([Promise.all(currentgames), Promise.all(completedgames), Promise.all(standingchallenges)]);
    console.log("work", work);

    games.forEach((game, ind) => {
      if (metaGameCounts[game] === undefined) {
        metaGameCounts[game] = { 
          "currentgames": work[0][ind].Items ? work[0][ind].Items!.length : 0, 
          "completedgames": work[1][ind].Items ? work[1][ind].Items!.length : 0, 
          "standingchallenges": work[2][ind].Items ? work[2][ind].Items!.length : 0
        };
      } else {
        metaGameCounts[game].currentgames = work[0][ind].Items ? work[0][ind].Items!.length : 0;
        metaGameCounts[game].completedgames = work[1][ind].Items ? work[1][ind].Items!.length : 0;
        metaGameCounts[game].standingchallenges = work[2][ind].Items ? work[2][ind].Items!.length : 0;
      }
    });

    console.log(metaGameCounts);
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: {
            "pk": "METAGAMES",
            "sk": "COUNTS",
            ...metaGameCounts
          }
        })
    );
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update meta game counts ${userId}`);
  }
}

async function updateMetaGameRatings(userId: string) {
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

    const metaGamesDataWork = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "METAGAMES", "sk": "COUNTS"
        },
      }));

    const data = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "USER" },
          ExpressionAttributeNames: { "#pk": "pk" }
        }));
    if (data.Items === undefined) {
      return;
    }
    let ratings: {
      [metaGame: string]: {player: string, name: string, rating: Rating}[];
    } = {};
    const users = data.Items as FullUser[];
    users.forEach(player => { 
      if (player.ratings) {
        Object.keys(player.ratings).forEach(metaGame => {
          if (ratings[metaGame] === undefined) 
            ratings[metaGame] = [];
          ratings[metaGame].push({player: player.id, name: player.name, rating: player.ratings![metaGame]});
        });
      }
    });

    let work: Promise<any>[] = [];
    const metaGamesData = await metaGamesDataWork;
    const metaGameCounts = metaGamesData.Item as MetaGameCounts;
    Object.keys(ratings).forEach(metaGame => {
      if (metaGameCounts[metaGame] === undefined) 
        metaGameCounts[metaGame] = {currentgames: 0, completedgames: 0, standingchallenges: 0, ratings: new Set()};
      ratings[metaGame].forEach(rating => {
        if (metaGameCounts[metaGame].ratings === undefined)
          metaGameCounts[metaGame].ratings = new Set();
        metaGameCounts[metaGame].ratings!.add(rating.player);
        work.push(ddbDocClient.send(
          new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "RATINGS#" + metaGame,
                "sk": rating.player,
                "id": rating.player,
                "name": rating.name,
                "rating": rating.rating
              }
            })
        ));
      });
    });
      
    work.push(ddbDocClient.send(
      new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: {
            "pk": "METAGAMES",
            "sk": "COUNTS",
            ...metaGameCounts
          }
        })
    ));
    await Promise.all(work);
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update meta game counts ${userId}`);
  }
}

async function onetimeFix(userId: string) {
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
    
    // Fix GAME
    let input: QueryCommandInput = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      FilterExpression: "begins_with(#pk, :g) and #sk = :s",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: { ":g": "GAME#", ":s": "GAME" }
    }
    let data = await ddbDocClient.send(new ScanCommand(input));
    console.log(`Found ${data.Items?.length} games`);
    if (data.Items !== undefined) {
      let work: Promise<any>[] = [];
      data.Items.forEach(item => {
        const game = item as unknown as FullGame;
        const {pk, sk, ...game2} = game;
        work.push(ddbDocClient.send(
          new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "GAME",
                "sk": game.id,
                ...game2
              }
          })
        ));
        work.push(ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": item.pk, 
              "sk": item.sk
            }
          })
        ));
      });
      await Promise.all(work);
      console.log(`Fixed ${data.Items.length} games`);
    }

    // Fix GAME COMMENTS
    input = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      FilterExpression: "begins_with(#pk, :g) and #sk = :s",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: { ":g": "GAME#", ":s": "COMMENTS" }
    }
    data = await ddbDocClient.send(new ScanCommand(input));
    if (data.Items !== undefined) {
      let work: Promise<any>[] = [];
      data.Items.forEach(comment => {
        work.push(ddbDocClient.send(
          new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "GAMECOMMENTS",
                "sk": (comment.pk as unknown as string).substring(5),
                "comments": comment.comments
              }
            })
        ));
        work.push(ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": comment.pk, 
              "sk": comment.sk
            }
          })
        ));
      });
      await Promise.all(work);
      console.log(`Fixed ${data.Items.length} game comments`);
    }

    // Fix USER
    input = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      FilterExpression: "begins_with(#pk, :g) and #sk = :s",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: { ":g": "USER#", ":s": "USER" }
    }
    data = await ddbDocClient.send(new ScanCommand(input));
    if (data.Items !== undefined) {
      let work: Promise<any>[] = [];
      data.Items.forEach(item => {
        const user = item as unknown as FullUser;
        const {pk, sk, ...user2} = user;
        work.push(ddbDocClient.send(
          new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "USER",
                "sk": user.id,
                ...user2
              }
            })
        ));
        work.push(ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": item.pk, 
              "sk": item.sk
            }
          })
        ));
      });
      await Promise.all(work);
      console.log(`Fixed ${data.Items.length} users`);
    }

    // Fix CHALLENGE
    input = {
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      FilterExpression: "begins_with(#pk, :c) and #sk = :s",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: { ":c": "CHALLENGE#", ":s": "CHALLENGE" }
    }
    data = await ddbDocClient.send(new ScanCommand(input));
    if (data.Items !== undefined) {
      let work: Promise<any>[] = [];
      data.Items.forEach(item => {
        const challenge = item as unknown as FullChallenge;
        const {pk, sk, ...challenge2} = challenge;
        work.push(ddbDocClient.send(
          new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "CHALLENGE",
                "sk": challenge.pk?.substring(10),
                ...challenge2
              }
            })
        ));
        work.push(ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": item.pk, 
              "sk": item.sk
            }
          })
        ));
      });
      await Promise.all(work);
      console.log(`Fixed ${data.Items.length} challenges`);
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to update meta game counts ${userId}`);
  }
}

async function testAsync(userId: string, pars: { N: number; }) {
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
    /*
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({"n": pars.N}),
      headers
    });
    */
    console.log(`Calling makeWork with ${pars.N}`);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    makeWork(); 
    console.log('Done calling makeWork');
    return {
      statusCode: 200,
      body: JSON.stringify({"n": pars.N}),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to test_async ${userId}`);
  }
}

function makeWork() {
  return new Promise(function(resolve) {
    console.log("In makeWork");
    setTimeout(() => {
      console.log("End makeWork");
      resolve('resolved');
    }, 3000);
  });
}

function Set_toJSON(key: any, value: any) {
  if (typeof value === 'object' && value instanceof Set) {
    return [...value];
  }
  return value;
}

function shuffle(array: any[]) {
  let i = array.length,  j;

  while (i > 1) {
    j = Math.floor(Math.random() * i);
    i--;
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

async function changeLanguageForPlayer(player: { language: string | undefined; }) {
  let lng = "en";
  if (player.language !== undefined)
    lng = player.language;
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
    console.log(`changed language to ${lng}`);
  }
}

function createSendEmailCommand(toAddress: string, player: any, subject: any, body: string) {
  console.log("toAddress", toAddress, "player", player, "body", body);
  const fullbody =  i18n.t("DearPlayer", { player }) + '\r\n\r\n' + body + "\r\n\r\n" + i18n.t("EmailOut");
  return new SendEmailCommand({
    Destination: {
      ToAddresses: [
        toAddress
      ],
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: fullbody
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject
      },
    },
    Source: "abstractplay@mail.abstractplay.com"
  });
}

async function initi18n(language: string) {
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    debug: true,
    resources: {
      en: {
        translation: en
      },
      fr: {
        translation: fr
      },
      it: {
        translation: it
      }
    }
  });
}

function formatReturnError(message: string) {
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: message
    }),
    headers
  };
}

// Handles errors during GetItem execution. Use recommendations in error messages below to
// add error handling specific to your application use-case.
function logGetItemError(err: unknown) {
  if (!err) {
    console.error('Encountered error object was empty');
    return;
  }
  if (!(err as { code: any; message: any; }).code) {
    console.error(`An exception occurred, investigate and configure retry strategy. Error: ${JSON.stringify(err)}`);
    console.error(err);
    return;
  }
  // here are no API specific errors to handle for GetItem, common DynamoDB API errors are handled below
  handleCommonErrors(err as { code: any; message: any; });
}

function handleCommonErrors(err: { code: any; message: any; }) {
  switch (err.code) {
    case 'InternalServerError':
      console.error(`Internal Server Error, generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case 'ProvisionedThroughputExceededException':
      console.error(`Request rate is too high. If you're using a custom retry strategy make sure to retry with exponential back-off. `
        + `Otherwise consider reducing frequency of requests or increasing provisioned capacity for your table or secondary index. Error: ${err.message}`);
      return;
    case 'ResourceNotFoundException':
      console.error(`One of the tables was not found, verify table exists before retrying. Error: ${err.message}`);
      return;
    case 'ServiceUnavailable':
      console.error(`Had trouble reaching DynamoDB. generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case 'ThrottlingException':
      console.error(`Request denied due to throttling, generally safe to retry with exponential back-off. Error: ${err.message}`);
      return;
    case 'UnrecognizedClientException':
      console.error(`The request signature is incorrect most likely due to an invalid AWS access key ID or secret key, fix before retrying. `
        + `Error: ${err.message}`);
      return;
    case 'ValidationException':
      console.error(`The input fails to satisfy the constraints specified by DynamoDB, `
        + `fix input before retrying. Error: ${err.message}`);
      return;
    case 'RequestLimitExceeded':
      console.error(`Throughput exceeds the current throughput limit for your account, `
        + `increase account level throughput before retrying. Error: ${err.message}`);
      return;
    default:
      console.error(`An exception occurred, investigate and configure retry strategy. Error: ${err.message}`);
      return;
  }
}