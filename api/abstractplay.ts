/* eslint-disable @typescript-eslint/ban-ts-comment */
'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
// import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory, GameBase, GameBaseSimultaneous } from '@abstractplay/gameslib';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import i18n from 'i18next';
import en from '../locales/en/apback.json';
import fr from '../locales/fr/apback.json';
import it from '../locales/it/apback.json';

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
    stars?: number;
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
  duration?: number;
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

export type UserSettings = {
    [k: string]: any;
    all?: {
        [k: string]: any;
        color?: string;
        annotate?: boolean;
        notifications?: {
            gameStart: boolean;
            gameEnd: boolean;
            challenges: boolean;
            yourturn: boolean;
        }
    }
};

export type User = {
  id: string;
  name: string;
  time?: number;
  settings?: UserSettings;
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
  settings: UserSettings;
  ratings?: {
    [metaGame: string]: Rating
  };
  stars?: string[];
}

type Rating = {
  rating: number;
  N: number;
  wins: number;
  draws: number;
}

type Game = {
  pk?: string,
  sk?: string,
  id : string;
  metaGame: string;
  players: User[];
  lastMoveTime: number;
  clockHard: boolean;
  toMove: string | boolean[];
  seen?: number;
  numMoves?: number;
  gameStarted?: number;
  gameEnded?: number;
  lastChat?: number;
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
  gameEnded?: number;
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
  pieInvoked?: boolean;
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

type PartialClaims = { sub: string; email: string; email_verified: boolean };

// It looks like there is no way to "run and forget", you need to finish all work before returning a response to the front end. :(
// Make sure the @typescript-eslint/no-floating-promises linter rule passes, otherwise promise might (at best?) only be fullfilled on the next call to the API...
module.exports.authQuery = async (event: { body: { query: any; pars: any; }; cognitoPoolClaims: PartialClaims; }) => {
  console.log("authQuery: ", event.body.query);
  const query = event.body.query;
  const pars = event.body.pars;
  switch (query) {
    case "me":
      return await me(event.cognitoPoolClaims, pars);
    case "my_settings":
      return await mySettings(event.cognitoPoolClaims);
    case "new_setting":
      return await newSetting(event.cognitoPoolClaims.sub, pars);
    case "new_profile":
      return await newProfile(event.cognitoPoolClaims, pars);
    case "new_challenge":
      return await newChallenge(event.cognitoPoolClaims.sub, pars);
    case "challenge_revoke":
      return await revokeChallenge(event.cognitoPoolClaims.sub, pars);
    case "challenge_response":
      return await respondedChallenge(event.cognitoPoolClaims.sub, pars);
    case "submit_move":
      return await submitMove(event.cognitoPoolClaims.sub, pars);
    case "invoke_pie":
      return await invokePie(event.cognitoPoolClaims.sub, pars);
    case "set_lastSeen":
      return await setLastSeen(event.cognitoPoolClaims.sub, pars);
    case "submit_comment":
      return await submitComment(event.cognitoPoolClaims.sub, pars);
    case "save_exploration":
      return await saveExploration(event.cognitoPoolClaims.sub, pars);
    case "get_exploration":
      return await getExploration(event.cognitoPoolClaims.sub, pars);
    case "get_game":
      return await game(event.cognitoPoolClaims.sub, pars);
    case "toggle_star":
      return await toggleStar(event.cognitoPoolClaims.sub, pars);
    case "set_game_state":
      return await injectState(event.cognitoPoolClaims.sub, pars);
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
  if (pars.type === "current") {
    try {
      const gamesData = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
          ExpressionAttributeValues: { ":pk": "GAME", ":sk": game + '#0#' },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));
      const gamelist = gamesData.Items as FullGame[];
      const returnlist = gamelist.map(g => {
        return { "id": g.id, "metaGame": g.metaGame, "players": g.players, "toMove": g.toMove, "gameStarted": g.gameStarted,
          "numMoves": JSON.parse(g.state).stack.length - 1 } });
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
  } else {
    return formatReturnError(`Unknown type ${pars.type}`);
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

async function game(userid: string, pars: { id: string, cbit: string | number, metaGame: string }) {
  try {
    if (pars.cbit !== 0 && pars.cbit !== 1 && pars.cbit !== "0" && pars.cbit !== "1") {
      return formatReturnError("cbit must be 0 or 1");
    }
    const getGame = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#" + pars.cbit + '#' + pars.id
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
    const game = gameData.Item as FullGame;
    if (game === undefined)
      throw new Error(`Game ${pars.id}, metaGame ${pars.metaGame}, completed bit ${pars.cbit} not found`);
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

async function toggleStar(userid: string, pars: {metaGame: string}) {
    try {
        // get player
        const player = (await getPlayers([userid]))[0];
        // add or remove metaGame
        let delta = 0;
        if (player.stars === undefined) {
            player.stars = [];
        }
        if (! player.stars.includes(pars.metaGame)) {
            delta = 1;
            player.stars.push(pars.metaGame);
        } else {
            delta = -1;
            const idx = player.stars.findIndex(m => m === pars.metaGame);
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
        console.log(`Queued update to player ${player.id}, ${player.name}, toggling star for ${pars.metaGame}: ${delta}`);

        /* Don't need to do this. Can just add directly. Assumes the metaCount has been updated before adding a new game, otherwise will throw an error. */
        // get metagame counts
        // const data = await ddbDocClient.send(
        //     new GetCommand({
        //       TableName: process.env.ABSTRACT_PLAY_TABLE,
        //       Key: {
        //         "pk": "METAGAMES", "sk": "COUNTS"
        //     },
        // }));
        // const details = data.Item as MetaGameCounts;
        // if (! (pars.metaGame in details)) {
        //     throw new Error(`Could not find a metagame record for '${pars.metaGame}'`);
        // }
        // // update count
        // if (details[pars.metaGame].stars === undefined) {
        //     details[pars.metaGame].stars = 0;
        // }
        // details[pars.metaGame].stars! += delta;

        // queue game update
        list.push(
            ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "METAGAMES", "sk": "COUNTS" },
                ExpressionAttributeNames: { "#g": pars.metaGame },            ExpressionAttributeValues: {":n": delta},
                UpdateExpression: "add #g.stars :n",
            }))
        );

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

async function injectState(userid: string, pars: { id: string; newState: string; metaGame: string;}) {
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
    game = gameData.Item as FullGame;
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
        Item: game
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

async function updateGameSettings(userid: string, pars: { game: string, settings: any, metaGame: string, cbit: number }) {
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

async function me(claim: PartialClaims, pars: { size: string }) {
  const userId = claim.sub;
  const email = claim.email;
  if (!claim.email || claim.email.trim().length === 0) {
    console.log(`How!?: claim.email is ${claim.email}`);
  }

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

    if (user.email !== email)
      await updateUserEMail(claim);
    let games = user.games;
    if (games == undefined)
      games= [];
    if (fixGames) {
      console.log("games before", games);
      games = await getGamesForUser(userId);
      console.log("games after", games);
    }
    // Check for out-of-time games
    games.forEach(async (game: Game) => {
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
            await timeloss(minIndex, game.id, game.metaGame, game.lastMoveTime);
          }
        } else {
          const toMove = parseInt(game.toMove);
          if (game.players[toMove].time! - (Date.now() - game.lastMoveTime) < 0) {
            game.lastMoveTime = game.lastMoveTime + game.players[toMove].time!;
            game.toMove = '';
            // DON'T parallelize this!
            await timeloss(toMove, game.id, game.metaGame, game.lastMoveTime);
          }
        }
      }
    });
    // Check for "recently completed games"
    // As soon as a game is over move it to archive status (game.type = 0).
    // Remove the game from user's games list 48 hours after they have seen it. "Seen it" means they clicked on the game (or they were the one that caused the end of the game).
    for (let i = games.length - 1; i >= 0; i-- ) {
      const game = games[i];
      if (game.toMove === "" || game.toMove === null ) {
        if ( (game.seen !== undefined) && (Date.now() - (game.seen || 0) > 48 * 3600000) && ((game.lastChat || 0) <= (game.seen || 0)) ) {
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
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userId },
      ExpressionAttributeValues: { ":dt": Date.now(), ":gs": games },
      UpdateExpression: "set lastSeen = :dt, games = :gs"
    }));
    if (data) {
      // Still trying to get to the bottom of games shown as "to move" when already moved.
      console.log(`me returning for ${user.name}, id ${user.id} with games`, games);
      return {
        statusCode: 200,
        body: JSON.stringify({
          "id": user.id,
          "name": user.name,
          "admin": (user.admin === true),
          "language": user.language,
          "games": games,
          "settings": user.settings,
          "stars": user.stars,
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
          "settings": user.settings,
          "stars": user.stars,
        }, Set_toJSON),
        headers
      }
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get user data for ${userId}`);
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

async function mySettings(claim: PartialClaims) {
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

async function newProfile(claim: PartialClaims, pars: { name: any; consent: any; anonymous: any; country: any; tagline: any; }) {
  const userid = claim.sub;
  const email = claim.email;
  if (!email || email.trim() === "") {
    logGetItemError(`No email for user ${pars.name}, id ${userid} in newProfile`);
    return formatReturnError(`No email for user ${pars.name}, id ${userid} in newProfile`);
  }
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
        "duration": challenge.duration,
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
        "duration": challenge.duration,
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
    if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
        if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
            await changeLanguageForPlayer(player);
            const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeSubject"), i18n.t("ChallengeBody", { "challenger": challengerName, metaGame, "interpolation": {"escapeValue": false} }));
            work.push(sesClient.send(comm));
        } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
        }
    } else {
        console.log(`No verified email address found for ${player.name} (${player.id})`);
    }
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
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
                await changeLanguageForPlayer(player);
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame, "interpolation": {"escapeValue": false}}));
                work.push(sesClient.send(comm));
            } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive YourTurn notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
      }
    }
    // Inform players that have already accepted
    if (challenge.players) {
      const players = await getPlayers(challenge.players.map((c: { id: any; }) => c.id).filter((id: any) => id !== challenge!.challenger.id));
      for (const player of players) {
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
                await changeLanguageForPlayer(player);
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame, "interpolation": {"escapeValue": false}}));
                work.push(sesClient.send(comm));
                    } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive YourTurn notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
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
            if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
                if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.gameStart) ) {
                    await changeLanguageForPlayer(player);
                    console.log(player);
                    let body = i18n.t("GameStartedBody", { metaGame: email.metaGame, "interpolation": {"escapeValue": false} });
                    if (ind === 0 || email.simultaneous) {
                      body += " " + i18n.t("YourMove");
                    }
                    const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameStartedSubject"), body);
                    work.push(sesClient.send(comm));
                } else {
                    console.log(`Player ${player.name} (${player.id}) has elected to not receive YourTurn notifications.`);
                }
            } else {
                console.log(`No verified email address found for ${player.name} (${player.id})`);
            }
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
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
                await changeLanguageForPlayer(player);
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRejectedSubject"), i18n.t("ChallengeRejectedBody", { quitter, metaGame, "interpolation": {"escapeValue": false} }));
                work.push(sesClient.send(comm));
            } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive YourTurn notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
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

  // determine if a standing challenge has expired
  let expired = false;
  if (standing) {
    if ( ("duration" in challenge) && (typeof challenge.duration === "number") && (challenge.duration > 0) ) {
        if (challenge.duration === 1) {
            expired = true;
        } else {
            list.push(
                ddbDocClient.send(
                    new UpdateCommand({
                        TableName: process.env.ABSTRACT_PLAY_TABLE,
                        Key: {"pk": "STANDINGCHALLENGE#" + challenge.metaGame, "sk": challenge.id},
                        ExpressionAttributeValues: {":d": challenge.duration - 1},
                        ExpressionAttributeNames: {"#d": "duration"},
                        UpdateExpression: "set #d = :d"
                    })
                )
            );
        }
    }
  }

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
      || expired
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
    || expired
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
    console.log(`Variants in the challenge object: ${JSON.stringify(variants)}`);
    let engine;
    if (info.playercounts.length > 1)
      engine = GameFactory(challenge.metaGame, challenge.numPlayers, variants);
    else
      engine = GameFactory(challenge.metaGame, undefined, variants);
    if (!engine)
      throw new Error(`Unknown metaGame ${challenge.metaGame}`);
    console.log(`Variants in the game engine: ${JSON.stringify(engine.variants)}`);
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
          "sk": challenge.metaGame + "#0#" + gameId,
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
    list.push(addToGameLists("CURRENTGAMES", game, now, false));

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

function addToGameLists(type: string, game: Game, now: number, keepgame: boolean) {
  const work: Promise<any>[] = [];
  const sk = now + "#" + game.id;
  if (type === "COMPLETEDGAMES" && keepgame) {
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
  }
  if (type === "CURRENTGAMES") {
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: {":n": 1},
      UpdateExpression: "add #g.currentgames :n"
    })));
  } else {
    let update = "add #g.currentgames :nm";
    const eavObj: {[k: string]: number} = {":nm": -1};
    if (keepgame) {
        update += ", #g.completedgames :n";
        eavObj[":n"] = 1
    }
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: eavObj,
      UpdateExpression: update
    })));
  }
  return Promise.all(work);
}

async function submitMove(userid: string, pars: { id: string, move: string, draw: string, metaGame: string, cbit: number}) {
  if (pars.cbit !== 0) {
    return formatReturnError("cbit must be 0");
  }
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metaGame + "#0#" + pars.id
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
  try {
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
        applySimultaneousMove(userid, pars.move, engine as GameBaseSimultaneous, game);
      } else {
        applyMove(userid, pars.move, engine, game, flags);
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
      "lastMoveTime": timestamp,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
    } as Game;
    const myGame = {
      "id": game.id,
      "metaGame": game.metaGame,
      "players": game.players,
      "clockHard": game.clockHard,
      "toMove": game.toMove,
      "lastMoveTime": timestamp,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
    } as Game;
    if (engine.gameover) {
        playerGame.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
        myGame.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
    }
    const list: Promise<any>[] = [];
    let newRatings: {[metaGame: string] : Rating}[] | null = null;
    if ((game.toMove === "" || game.toMove === null)) {
      newRatings = updateRatings(game, players);
      myGame.seen = Date.now();
      if (game.numMoves && game.numMoves > game.numPlayers)
        playerGame.numMoves = game.numMoves;
      list.push(addToGameLists("COMPLETEDGAMES", playerGame, timestamp, game.numMoves !== undefined && game.numMoves > game.numPlayers));
      // delete at old sk
      list.push(ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk":"GAME",
            "sk": game.sk
          }
        })
      ));
      console.log("Scheduled delete and updates to game lists");
      game.sk = game.metaGame + "#1#" + game.id;
    }
    game.lastMoveTime = timestamp;
    const updateGame = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: game
      }));
    list.push(updateGame);
    console.log("Scheduled update to game");
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
        console.log(`Scheduled update to player ${player.id}, ${player.name}, with games`, games);
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
        console.log(`Scheduled update to player ${player.id} with games and ratings`, games, newRatings[ind][game.metaGame]);

        list.push(ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "METAGAMES", "sk": "COUNTS" },
          ExpressionAttributeNames: { "#g": game.metaGame },
          ExpressionAttributeValues: {":p": new Set([player.id])},
          UpdateExpression: "add #g.ratings :p",
        })));
        console.log(`Scheduled update to metagame ratings counts with player ${player.id}`);
      }
    });

    if (simultaneous)
      game.partialMove = game.players.map((p: User, i: number) => (p.id === userid ? game.partialMove!.split(',')[i] : '')).join(',');

    list.push(sendSubmittedMoveEmails(game, players, simultaneous, newRatings));
    console.log("Scheduled emails");
    await Promise.all(list);
    console.log("All updates complete");
    return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError('Unable to process submit move');
  }
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

async function sendSubmittedMoveEmails(game: FullGame, players0: FullUser[], simultaneous: any, newRatings: any[] | null) {
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
    // const players = players0.filter(p => playerIds.includes(p.id));
    // const metaGame = gameinfo.get(game.metaGame).name;
    // for (const player of players) {
    //   await changeLanguageForPlayer(player);
    //   const comm = createSendEmailCommand(player.email, player.name, i18n.t("YourMoveSubject"), i18n.t("YourMoveBody", { metaGame, "interpolation": {"escapeValue": false} }));
    //   work.push(sesClient.send(comm));
    // }
  } else {
    // Game over
    const playerIds = game.players.map((p: { id: any; }) => p.id);
    const players = players0.filter((p: { id: any; }) => playerIds.includes(p.id));
    const metaGame = gameinfo.get(game.metaGame).name;
    const engine = GameFactory(game.metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game.metaGame}`);
    const scores = [];
    if (gameinfo.get(game.metaGame).flags.includes("scores")) {
        for (let p = 1; p <= engine.numplayers; p++) {
            scores.push(engine.getPlayerScore(p));
        }
    }

    for (const [ind, player] of players.entries()) {
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.gameEnd) ) {
                await changeLanguageForPlayer(player);
                // The Game Over email has a few components:
                const body = [];
                //   - Initial line
                body.push(i18n.t("GameOverBody", {metaGame}));
                //   - Winner statement
                let result = "lose";
                if (engine.winner.length > 1) {
                    result = "draw";
                } else if (engine.winner.length === 1) {
                    const winner = playerIds[engine.winner[0] - 1];
                    if (winner === player.id) {
                        result = "win";
                    }
                }
                body.push(i18n.t("GameOverResult", {context: result}));
                //   - Rating, if applicable
                if (newRatings != null) {
                    body.push(i18n.t("GameOverRating", {"rating" : `${Math.round(newRatings[ind][game.metaGame].rating)}`, "interpolation": {"escapeValue": false} }));
                }
                //   - Final scores, if applicable
                if (scores.length > 0) {
                    body.push(i18n.t("GameOverScores", {scores: scores.join(", ")}))
                }
                //   - Direct link to game
                body.push(i18n.t("GameOverLink", {metaGame: game.metaGame, gameID: game.id}));

                const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameOverSubject"), body.join(" "));
                work.push(sesClient.send(comm));
            } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive game end notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
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

async function timeloss(player: number, gameid: string, metaGame: string, timestamp: number) {
  let data: any;
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": metaGame + "#0#" + gameid
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    throw new Error(`Unable to get game ${metaGame}, ${gameid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${metaGame}, ${gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);

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
    "lastMoveTime": game.lastMoveTime,
    "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
    "gameEnded": new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
  } as Game;
  const work: Promise<any>[] = [];
  if (game.numMoves && game.numMoves > game.numPlayers)
    playerGame.numMoves = game.numMoves;
  work.push(addToGameLists("COMPLETEDGAMES", playerGame, game.lastMoveTime, game.numMoves !== undefined && game.numMoves > game.numPlayers));

  // delete at old sk
  work.push(ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk":"GAME",
        "sk": game.sk
      }
    })
  ));
  console.log("Scheduled delete and updates to game lists");
  game.sk = game.metaGame + "#1#" + game.id;

  work.push(ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: game
    })));

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
        UpdateExpression: "add #g.ratings :p",
      })));
    }
  });
  return Promise.all(work);
}

function applySimultaneousMove(userid: string, move: string, engine: GameBaseSimultaneous, game: FullGame) {
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
    // check if current player is eliminated and insert a blank move
    // all simultaneous games should accept the character U+0091 as a blank move for eliminated players
    if (engine.isEliminated(i + 1)) {
        moves[i] = '\u0091';
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
    engine.move(game.partialMove, true);
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

function applyMove(userid: string, move: string, engine: GameBase, game: FullGame, flags: string[]) {
  // non simultaneous move game.
  if (game.players[parseInt(game.toMove as string)].id !== userid) {
    throw new Error('It is not your turn!');
  }
  console.log("applyMove", move);
  engine.move(move);
  let count = 1;
  if (flags !== undefined && flags.includes("automove")) {
    console.log("Automove detected");
    // @ts-ignore
    while (engine.moves().length === 1) {
        console.log("Single move detected");
        count++;
        // @ts-ignore
        engine.move(engine.moves()[0]);
    }
  }
  console.log("applied");
  game.state = engine.serialize();
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  }
  else
    game.toMove = `${(parseInt(game.toMove as string) + count) % game.players.length}`;
  console.log("done");
}

async function submitComment(userid: string, pars: { id: string; players?: {[k: string]: any; id: string}[]; metaGame?: string, comment: string; moveNumber: number; }) {
  // reject empty comments
  if ( (pars.comment.length === 0) || (/^\s*$/.test(pars.comment) ) ) {
    return formatReturnError(`Refusing to accept blank comment.`);
  }
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

  // if game is completed, `players` will be passed
  // pull each user's record and update `lastChat`
  if ( ("players" in pars) && (pars.players !== undefined) && (Array.isArray(pars.players)) && ("metaGame" in pars) && (pars.metaGame !== undefined) ) {
    console.log("This game is closed, so finding all user records");
    for (const pid of pars.players.map(p => p.id)) {
        let data: any;
        let user: FullUser|undefined;
        try {
            data = await ddbDocClient.send(
                new GetCommand({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "USER",
                    "sk": pid
                    },
                })
            )
            if (data.Item !== undefined) {
                user = data.Item as FullUser;
            }
        } catch (err) {
            logGetItemError(err);
            return formatReturnError(`Unable to get user data for user ${pid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
        }
        if (user === undefined) {
            return formatReturnError(`Unable to get user data for user ${pid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
        }
        console.log(`Found the following user data:`);
        console.log(JSON.stringify(user));
        const game = user.games.find(g => g.id === pars.id);
        if (game !== undefined) {
            game.lastChat = Date.now();
            // if this is the player who submitted the comment, also update their `lastSeen`
            // so the chat doesn't get flagged as new
            if (pid === userid) {
                game.seen = game.lastChat + 10;
            }
        } else {
            console.log(`User ${user.name} does not have a game entry for ${pars.id}`);
            // pull the corresponding full game record
            let data: any;
            let fullGame: FullGame|undefined;
            try {
                data = await ddbDocClient.send(
                    new GetCommand({
                      TableName: process.env.ABSTRACT_PLAY_TABLE,
                      Key: {
                        "pk": "GAME",
                        "sk": `${pars.metaGame}#1#${pars.id}`
                        },
                    })
                )
                if (data.Item !== undefined) {
                    fullGame = data.Item as FullGame;
                }
            } catch (err) {
                logGetItemError(err);
                return formatReturnError(`Unable to get full game record for ${pars.metaGame}, id ${pars.id}, from table ${process.env.ABSTRACT_PLAY_TABLE}`);
            }
            if (fullGame === undefined) {
                return formatReturnError(`Unable to get full game record for ${pars.metaGame}, id ${pars.id}, from table ${process.env.ABSTRACT_PLAY_TABLE}`);
            }
            // push a new `Game` object
            const engine = GameFactory(pars.metaGame, fullGame.state);
            if (engine === undefined) {
                return formatReturnError(`Unable to hydrate state for ${pars.metaGame}: ${fullGame.state}`);
            }
            user.games.push({
                id: pars.id,
                metaGame: pars.metaGame,
                players: [...fullGame.players],
                lastMoveTime: fullGame.lastMoveTime,
                clockHard: fullGame.clockHard,
                toMove: fullGame.toMove,
                numMoves: engine.stack.length - 1,
                gameStarted: new Date(engine.stack[0]._timestamp).getTime(),
                gameEnded: new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
                lastChat: new Date().getTime(),
            });
        }
        try {
            console.log(`About to save updated user record: ${JSON.stringify(user)}`);
            await ddbDocClient.send(new PutCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Item: user
                })
            );
        } catch (err) {
            logGetItemError(err);
            return formatReturnError(`Unable to save lastchat for user ${pid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
        }
    }
  }
}

async function saveExploration(userid: string, pars: { game: string; move: number; tree: any; }) {
  await ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "GAMEEXPLORATION#" + pars.game,
        "sk": userid + "#" + pars.move,
        "user": userid,
        "game": pars.game,
        "move": pars.move,
        "tree": JSON.stringify(pars.tree)
      }
    }));
}

async function getExploration(userid: string, pars: { game: string; move: number }) {
  const work: Promise<any>[] = [];
  try {
    work.push(ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMEEXPLORATION#" + pars.game,
          "sk": userid + "#" + pars.move
          },
      })
    ));

    if (pars.move > 1) {
      work.push(ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAMEEXPLORATION#" + pars.game,
            "sk": userid + "#" + (pars.move - 2)
            },
        })
      ));
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get exploration data for game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const data = await Promise.all(work);
  const trees = data.map((d: any) => d.Item);
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
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
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAME", ":sk": game + '#0#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    const completedgames = games.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));
    const standingchallenges = games.map(game => ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ProjectionExpression: "#pk, #sk"
      })));

    const metaGamesData = await metaGamesDataWork;
    let metaGameCounts: MetaGameCounts;
    if (metaGamesData.Item === undefined)
      metaGameCounts = {};
    else
      metaGameCounts = metaGamesData.Item as MetaGameCounts;

    const work = await Promise.all([Promise.all(currentgames), Promise.all(completedgames), Promise.all(standingchallenges)]);
    console.log("work", work);

    // process stars
    const data = await ddbDocClient.send(
        new QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "USER" },
            ExpressionAttributeNames: { "#pk": "pk" },
            ReturnConsumedCapacity: "INDEXES",
        })
    );
    if ( (data !== undefined) && ("ConsumedCapacity" in data) && (data.ConsumedCapacity !== undefined) && ("CapacityUnits" in data.ConsumedCapacity) && (data.ConsumedCapacity.CapacityUnits !== undefined) ) {
        console.log(`Units consumed by player read: ${data.ConsumedCapacity.CapacityUnits}`);
    }
    const players = data?.Items as FullUser[];
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

    games.forEach((game, ind) => {
      if (metaGameCounts[game] === undefined) {
        metaGameCounts[game] = {
          "currentgames": work[0][ind].Items ? work[0][ind].Items!.length : 0,
          "completedgames": work[1][ind].Items ? work[1][ind].Items!.length : 0,
          "standingchallenges": work[2][ind].Items ? work[2][ind].Items!.length : 0,
          "stars": starCounts.has(game) ? starCounts.get(game)! : 0,
        };
      } else {
        metaGameCounts[game].currentgames = work[0][ind].Items ? work[0][ind].Items!.length : 0;
        metaGameCounts[game].completedgames = work[1][ind].Items ? work[1][ind].Items!.length : 0;
        metaGameCounts[game].standingchallenges = work[2][ind].Items ? work[2][ind].Items!.length : 0;
        metaGameCounts[game].stars = starCounts.has(game) ? starCounts.get(game)! : 0;
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
    const ratings: {
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

    const work: Promise<any>[] = [];
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

async function invokePie(userid: string, pars: {id: string, metaGame: string, cbit: number}) {
    if (pars.cbit !== 0) {
      return formatReturnError("cbit must be 0");
    }
    let data: any;
    try {
      data = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": pars.metaGame + "#0#" + pars.id
          },
        }));
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
    if (!data.Item)
      throw new Error(`No game ${pars.id} in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    try {
      const game = data.Item as FullGame;
      console.log("got game in invokePie:");
      console.log(game);
      const engine = GameFactory(game.metaGame, game.state);
      if (!engine)
        throw new Error(`Unknown metaGame ${game.metaGame}`);
      const flags = gameinfo.get(game.metaGame).flags;
      if ( (flags === undefined) || (! flags.includes("pie"))) {
        throw new Error(`Metagame ${pars.metaGame} does not have the "pie" flag. Aborting.`);
      }
      const lastMoveTime = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();

      const player = game.players.find(p => p.id === userid);
      if (!player)
        throw new Error(`Player ${userid} isn't playing in game ${pars.id}`)

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
      console.log(`Current player list: ${JSON.stringify(game.players)}`);
      const reversed = [...game.players].reverse();
      console.log(`Reversed: ${JSON.stringify(reversed)}`);
      game.players = [...reversed];
      game.pieInvoked = true;

      // this should be all the info we want to show on the "my games" summary page.
      const playerGame = {
        "id": game.id,
        "metaGame": game.metaGame,
        // reverse the list of players
        "players": [...reversed],
        "clockHard": game.clockHard,
        "toMove": game.toMove,
        "lastMoveTime": timestamp
      } as Game;
      const myGame = {
        "id": game.id,
        "metaGame": game.metaGame,
        // reverse the list of players
        "players": [...reversed],
        "clockHard": game.clockHard,
        "toMove": game.toMove,
        "lastMoveTime": timestamp
      } as Game;
      const list: Promise<any>[] = [];
      game.lastMoveTime = timestamp;
      const updateGame = ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: game
        }));
      list.push(updateGame);
      console.log("Scheduled update to game");
      // Update players
      players.forEach((player) => {
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
        list.push(
        ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "USER", "sk": player.id },
            ExpressionAttributeValues: { ":gs": games },
            UpdateExpression: "set games = :gs",
        }))
        );
        console.log(`Scheduled update to player ${player.id}, ${player.name}, with games`, games);
      });

      // insert a comment into the game log
      list.push(submitComment("", {id: game.id, comment: "Pie invoked.", moveNumber: 2}));

      list.push(sendSubmittedMoveEmails(game, players, false, []));
      console.log("Scheduled emails");
      await Promise.all(list);
      console.log("All updates complete");
      return {
        statusCode: 200,
        body: JSON.stringify(game),
        headers
      };
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError('Unable to process invoke pie');
    }
}

async function setLastSeen(userId: string, pars: {gameId: string; interval?: number;}) {
    // get USER rec
    let user: FullUser|undefined;
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
        return formatReturnError(`Unable to onetimeFix ${userId}`);
    }
    if (user !== undefined) {
        // find matching game
        const game = user.games.find(g => g.id === pars.gameId);
        if (game !== undefined) {
            // set lastSeen to "now" + interval
            let interval = 3;
            if (pars.interval !== undefined) {
                interval = pars.interval;
            }
            const now = new Date();
            const then = new Date();
            then.setDate(now.getDate() - interval);
            game.seen = then.getTime();
            console.log(`Setting lastSeen for ${game.id} to ${then.getTime()} (${then.toUTCString()}). It is currently ${new Date().toUTCString()}`);
            // you need to set `lastChat` as well or chats near the end of the game will be flagged
            game.lastChat = then.getTime();
            // save USER rec
            await ddbDocClient.send(new PutCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: user
            }));
            return {
                statusCode: 200,
                body: "",
                headers
            };
        }
    }
    return {
        statusCode: 406,
        body: "",
        headers
    };
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
//   let totalUnits = 0;
//   // get all USER records
//   let data: any;
//   let users: FullUser[] = [];
//   try {
//     data = await ddbDocClient.send(
//         new QueryCommand({
//             TableName: process.env.ABSTRACT_PLAY_TABLE,
//             KeyConditionExpression: "#pk = :pk",
//             ExpressionAttributeValues: { ":pk": "USER" },
//             ExpressionAttributeNames: { "#pk": "pk" },
//             ReturnConsumedCapacity: "INDEXES",
//         })
//       )
//       if ( (data !== undefined) && ("ConsumedCapacity" in data) && (data.ConsumedCapacity !== undefined) && ("CapacityUnits" in data.ConsumedCapacity) && (data.ConsumedCapacity.CapacityUnits !== undefined) ) {
//         totalUnits += data.ConsumedCapacity.CapacityUnits;
//       } else {
//         console.log(`Could not add consumed capacity: ${JSON.stringify(data?.ConsumedCapacity)}`);
//       }
//       users = data?.Items as FullUser[];
//       console.log(JSON.stringify(users, null, 2));
//   } catch (err) {
//     logGetItemError(err);
//     return formatReturnError(`Unable to onetimeFix get all users`);
//   }
//   const memoGame = new Map<string, FullGame>();
//   const memoComments = new Map<string, Comment[]>();
//   // foreach USER
//   for (const user of users) {
//     // foreach game in USER.games
//     for (const game of user.games) {
//         // check if game is already loaded
//         if (! memoGame.has(game.id)) {
//             // load and memoize
//             let data: any;
//             let cbit = "0";
//             if ( (game.toMove === "") || (game.toMove === undefined) || ( (Array.isArray(game.toMove)) && (game.toMove.length === 0) ) ) {
//                 cbit = "1";
//             }
//             try {
//               data = await ddbDocClient.send(
//                 new GetCommand({
//                   TableName: process.env.ABSTRACT_PLAY_TABLE,
//                   Key: {
//                     "pk": "GAME",
//                     "sk": `${game.metaGame}#${cbit}#${game.id}`
//                   },
//                   ReturnConsumedCapacity: "INDEXES",
//                 }));
//             } catch (error) {
//               logGetItemError(error);
//               return formatReturnError(`Unable to get comments for game ${game.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
//             }
//             if ( (data !== undefined) && ("ConsumedCapacity" in data) && (data.ConsumedCapacity !== undefined) && ("CapacityUnits" in data.ConsumedCapacity) && (data.ConsumedCapacity.CapacityUnits !== undefined) ) {
//                 totalUnits += data.ConsumedCapacity.CapacityUnits;
//             } else {
//               console.log(`Could not add consumed capacity: ${JSON.stringify(data?.ConsumedCapacity)}`);
//             }
//             const gameData = data.Item as FullGame;
//             console.log("got game in onetimeFix:");
//             console.log(gameData);
//             memoGame.set(game.id, gameData);
//         }
//         const gameObj = memoGame.get(game.id);
//         // check if comments already loaded
//         if (! memoComments.has(game.id)) {
//             // load and memoize
//             let data: any;
//             try {
//               data = await ddbDocClient.send(
//                 new GetCommand({
//                   TableName: process.env.ABSTRACT_PLAY_TABLE,
//                   Key: {
//                     "pk": "GAMECOMMENTS",
//                     "sk": game.id
//                   },
//                   ReturnConsumedCapacity: "INDEXES",
//                 }));
//             } catch (error) {
//               logGetItemError(error);
//               return formatReturnError(`Unable to get comments for game ${game.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
//             }
//             if ( (data !== undefined) && ("ConsumedCapacity" in data) && (data.ConsumedCapacity !== undefined) && ("CapacityUnits" in data.ConsumedCapacity) && (data.ConsumedCapacity.CapacityUnits !== undefined) ) {
//                 totalUnits += data.ConsumedCapacity.CapacityUnits;
//             } else {
//               console.log(`Could not add consumed capacity: ${JSON.stringify(data?.ConsumedCapacity)}`);
//             }
//             const commentsData = data.Item;
//             console.log("got comments in onetimeFix:");
//             console.log(commentsData);
//             let comments: Comment[];
//             if (commentsData === undefined)
//               comments= []
//             else
//               comments = commentsData.comments;
//             memoComments.set(game.id, comments);
//         }
//         const comments = memoComments.get(game.id)!;
//         // if for some reason the game ID doesn't match a record, skip entirely
//         if (gameObj === undefined) {
//             console.log(`Could not find a full game record for the following: ${JSON.stringify(game)}`);
//             continue;
//         }
//         let engine: GameBase|GameBaseSimultaneous|undefined;
//         try {
//             engine = GameFactory(gameObj.metaGame, gameObj.state);
//         } catch (err) {
//             console.log(`An error occured when trying to hydrate the following game: ${JSON.stringify(game)}`);
//             console.log(err);
//             continue;
//         }
//         if (engine === undefined) {
//             return formatReturnError(`Unable to get engine for ${gameObj.metaGame} with state ${gameObj.state}`);
//         }
//         // add gameStarted
//         game.gameStarted = new Date(engine.stack[0]._timestamp).getTime();
//         // add gameEnded, if applicable
//         if (engine.gameover) {
//             game.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
//         }
//         // add lastChat, if applicable
//         if (comments.length > 0) {
//             game.lastChat = Math.max(...comments.map(c => c.timeStamp));
//         }
//     }
//     console.log(`About to save updated USER record: ${JSON.stringify(user)}`);
//     // save updated USER record
//     await ddbDocClient.send(new PutCommand({
//         TableName: process.env.ABSTRACT_PLAY_TABLE,
//           Item: user
//     }));
//   }
//   console.log(`All done! Total units used: ${totalUnits}`);
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

export async function changeLanguageForPlayer(player: { language: string | undefined; }) {
  let lng = "en";
  if (player.language !== undefined)
    lng = player.language;
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
    console.log(`changed language to ${lng}`);
  }
}

export function createSendEmailCommand(toAddress: string, player: any, subject: any, body: string) {
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

export async function initi18n(language: string) {
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

export function formatReturnError(message: string) {
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
export function logGetItemError(err: unknown) {
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

export function handleCommonErrors(err: { code: any; message: any; }) {
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
