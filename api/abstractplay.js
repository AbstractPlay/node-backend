'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { gameinfo, GameFactory } = require('@abstractplay/gameslib');
const { SESClient, SendEmailCommand, UpdateCustomVerificationEmailTemplateCommand } = require('@aws-sdk/client-ses');
const i18n = require('i18next');
const en = require('../locales/en/translation.json');
const fr = require('../locales/fr/translation.json');
const it = require('../locales/it/translation.json');

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
module.exports.query = async (event) => {
  console.log(event);
  const pars = event.queryStringParameters;
  console.log(pars);
  switch (pars.query) {
    case "user_names":
      return await userNames(callback);
    case "challenge_details":
      return await challengeDetails(pars, callback);
    case "standing_challenges":
      return await standingChallenges(pars, callback);
    case "meta_games":
      return await metaGamesDetails(pars, callback);
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

// This implementation mixes async and use of the callback. This is probably not ideal and raises
//    WARNING: Callback/response already delivered. Did your function invoke the callback and also return a promise?
// but it does seem to work and do what I want: in some cases (e.g. when sending e-mails), I'd like the lambda to return data to the front end before worrying about whether e-mails got sent or not. 
// In some cases DB updates can also be done after the response is sent. Trying to do this with a purely async approach causes the unresolved promises to be completed in the next lambda 
// invocation and will therefore only work if AWS Lambda chooses to reuse the execution context.
// Possibly the "right" way to do this is to use a non-async authQuery (with context.callbackWaitsForEmptyEventLoop = false) that calls all the async stuff (using https://javascript.info/task/async-from-regular).
//
// On reading all this again, I think we need to fix this. Even if we make things non-async and try to use context.callbackWaitsForEmptyEventLoop = false, we still have "any outstanding events continue to run 
//  during the next invocation."
// So it looks like there is no way to "run and forget", you need to finish all work before returning a response to the front end. :(
// 
module.exports.authQuery = async (event, context, callback) => {
  console.log("authQuery: ", event.body.query);
  const query = event.body.query;
  const pars = event.body.pars;
  switch (query) {
    case "me":
      return await me(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email, callback);
    case "my_settings":
      return await mySettings(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email, callback);
    case "new_setting":
      return await newSetting(event.cognitoPoolClaims.sub, pars, callback);
    case "new_profile":
      return await newProfile(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email, pars, callback);
    case "new_challenge":
      return await newChallenge(event.cognitoPoolClaims.sub, pars, callback);
    case "challenge_revoke":
      return await revokeChallenge(event.cognitoPoolClaims.sub, pars, callback);
    case "challenge_response":
      return await respondedChallenge(event.cognitoPoolClaims.sub, pars, callback);
    case "submit_move":
      return await submitMove(event.cognitoPoolClaims.sub, pars, callback);
    case "submit_comment":
      return await submitComment(event.cognitoPoolClaims.sub, pars, callback);
    case "get_game":
      return await game(event.cognitoPoolClaims.sub, pars, callback);
    case "update_game_settings":
      return await updateGameSettings(event.cognitoPoolClaims.sub, pars, callback);
    case "update_user_settings":
      return await updateUserSettings(event.cognitoPoolClaims.sub, pars, callback);
    case "update_meta_game_counts":
      return await updateMetaGameCounts(event.cognitoPoolClaims.sub, pars, callback);
    case "test_async":
      return await testAsync(event.cognitoPoolClaims.sub, pars, callback);
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
    return {
      statusCode: 200,
      body: JSON.stringify(data.Items.map(u => ({"id": u.sk, "name": u.name}))),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to query table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function challengeDetails(pars) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "CHALLENGE#" + pars.id, "sk": "CHALLENGE"
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
    returnError(`Unable to get challenge ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function standingChallenges(pars) {
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
    returnError(`Unable to get standing challenges for ${pars.metaGame}`);
  }
}

async function metaGamesDetails(pars) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "METAGAMES", "sk": "COUNTS"
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
    returnError("Unable to get meta game details.");
  }
}

async function game(userid, pars) {
  try {
    const getGame = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME#" + pars.id,
          "sk": "GAME"
        },
      }));
    const getComments = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME#" + pars.id,
          "sk": "COMMENTS"
        },
        ReturnConsumedCapacity: "INDEXES"
      }));
    const gameData = await getGame;
    console.log("Got:");
    console.log(gameData);
    let game = gameData.Item;
    // If the game is over update user to indicate they have seen the game end.
    let work;
    if (game.toMove === "" || game.toMove === null) {
      work = setSeenTime(userid, pars.id);
    }
    // hide other player's simulataneous moves
    const flags = gameinfo.get(game.metaGame).flags;
    if (flags !== undefined && flags.includes('simultaneous') && game.partialMove !== undefined) {
      game.partialMove = game.partialMove.split(',').map((m,i) => game.players[i].id === userid ? m : '').join(',');
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
    returnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function updateGameSettings(userid, pars) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME#" + pars.game,
          "sk": "GAME"
        },
      }));
    console.log("Got:");
    console.log(data);
    let game = data.Item;
    let player = game.players.find(p => p.id === userid);
    player.settings = pars.settings;
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: game
        }));
    }
    catch (error) {
      logGetItemError(error);
      returnError(`Unable to update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
    return {
      statusCode: 200,
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get or update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function setSeenTime(userid, gameid) {
  let user = {};
  try {
    user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER#" + userid,
          "sk": "USER"
        },
      }));
    if (user.Item === undefined)
      throw new Error(`setSeenTime, no user?? ${userid}`);
  } catch (err) {
    logGetItemError(err);
    throw new Error(`setSeenTime, no user?? ${userid}`);
  }

  let games = user.Item.games;
  let thegame = games.find(g => g.id == gameid);
  if (thegame !== undefined) {
    thegame.seen = Date.now();
  }
  return ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + userid, "sk": "USER" },
    ExpressionAttributeValues: { ":gs": games },
    UpdateExpression: "set games = :gs",
  }));
}

async function updateUserSettings(userid, pars) {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userid, "sk": "USER" },
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
    returnError(`Unable to store user settings for user ${userid}`);
  }
}

async function me(userId, email) {
  const fixGames = false;
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER#" + userId,
          "sk": "USER"
        },
      }));
    if (user.Item === undefined) {
      return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      };
    }
    let work = [];
    if (user.Item.email !== email)
      work.push(updateUserEMail(userId, email));
    var games = user.Item.games;
    if (games == undefined)
      games= [];
    if (fixGames) {
      console.log("games before", games);
      games = await getGamesForUser(userId);
      console.log("games after", games);
    }
    // Check for out-of-time games
    games.forEach(game => {
      if (game.clockHard && game.toMove !== '') {
        if (Array.isArray(game.toMove)) {
          let minTime = 0;
          let minIndex = -1;
          const elapsed = Date.now() - game.lastMoveTime;
          game.toMove.forEach((p, i) => {
            if (p && game.players[i].time - elapsed < minTime) {
              minTime = game.players[i].time - elapsed;
              minIndex = i;
            }});
          if (minIndex !== -1) {
            game.toMove = '';
            game.lastMoveTime = game.lastMoveTime + game.players[minIndex].time;
            work.push(timeloss(minIndex, game.id, game.lastMoveTime));
          }
        } else {
          if (game.players[game.toMove].time - (Date.now() - game.lastMoveTime) < 0) {
            game.lastMoveTime = game.lastMoveTime + game.players[game.toMove].time;
            const toMove = game.toMove;
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
        if (games[i].seen !== undefined) {
          console.log(`since seen for ${games[i].metaGame}`, Date.now() - games[i].seen);
        }
        if (games[i].seen !== undefined && Date.now() - games[i].seen > 1 * 3600000) {
          games.splice(i, 1);
        }
      }
    }
    let challengesIssuedIDs = [];
    let challengesReceivedIDs = [];
    let challengesAcceptedIDs = [];
    let standingChallengeIDs = [];
    if (user.Item.challenges !== undefined) {
      if (user.Item.challenges.issued !== undefined)
        challengesIssuedIDs = user.Item.challenges.issued;
      if (user.Item.challenges.received !== undefined)
        challengesReceivedIDs = user.Item.challenges.received;
      if (user.Item.challenges.accepted !== undefined)
        challengesAcceptedIDs = user.Item.challenges.accepted;
      if (user.Item.challenges.standing !== undefined)
        standingChallengeIDs = user.Item.challenges.standing;
    }
    const challengesIssued = getChallenges(challengesIssuedIDs);
    const challengesReceived = getChallenges(challengesReceivedIDs);
    const challengesAccepted = getChallenges(challengesAcceptedIDs);
    const standingChallenges = getChallenges(standingChallengeIDs);
    const data = await Promise.all([challengesIssued, challengesReceived, challengesAccepted, standingChallenges]);
    // Update last seen date for user
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userId, "sk": "USER" },
      ExpressionAttributeValues: { ":dt": Date.now(), ":gs": games },
      UpdateExpression: "set lastSeen = :dt, games = :gs"
    })));
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify({
        "id": user.Item.id,
        "name": user.Item.name,
        "admin": (user.Item.admin === true),
        "language": user.Item.language,
        "games": games,
        "settings": user.Item.settings,
        "challengesIssued": data[0].map(d => d.Item),
        "challengesReceived": data[1].map(d => d.Item),
        "challengesAccepted": data[2].map(d => d.Item),
        "standingChallenges": data[3].map(d => d.Item)
      }, Set_toJSON),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to get user data for ${userId}`);
  }
}

async function updateUserEMail(userid, newMail) {
  return ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + userid, "sk": "USER" },
    ExpressionAttributeValues: { ":e": newMail },
    UpdateExpression: "set email = :e",
  }));
}

async function mySettings(userId, email) {
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER#" + userId,
          "sk": "USER"
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
    returnError(`Unable to get user data for ${userId}`);
  }
}

async function newSetting(userId, pars, callback) {
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
  let work = [];
  work.push(ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + userId, "sk": "USER" },
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

async function getGames(gameIds) {
  let games = [];
  gameIds.forEach(id => {
    games.push(
      ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME#" + id,
            "sk": "GAME"
          }
        })));
  });
  const games2 = await Promise.all(games);
  let list = [];
  games2.forEach(game => {
    list.push(game.Item);
  });
  return list;
}

// This is expensive, so only use when things go belly up. E.g. if a game had to be deleted.
async function getGamesForUser(userId) {
  let games = [];
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

function processGames(userid, result, games) {
  result.Items.forEach(game => {
    if (game.players.some(p => p.id === userid)) {
      games.push({"id": game.id, "metaGame": game.metaGame, "players": game.players, "clockHard": game.clockHard, "toMove": game.toMove, "lastMoveTime": game.lastMoveTime});
    }
  });
}

async function getChallenges(challengeIds) {
  const challenges = [];
  challengeIds.forEach(id => {
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
              "pk": "CHALLENGE#" + id,
              "sk": "CHALLENGE"
            }
          })
        )
      );
    }
  });
  return Promise.all(challenges);
}

async function newProfile(userid, email, pars) {
  const data = {
      "pk": "USER#" + userid,
      "sk": "USER",
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
    returnError(`Unable to store user profile for user ${pars.name}`);
  }
}

async function newChallenge(userid, pars) {
  console.log("newChallenge pars:", pars);
  if (pars.standing) {
    return await newStandingChallenge(userid, pars);
  }
  const challengeId = crypto.randomUUID();
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "CHALLENGE#" + challengeId,
        "sk": "CHALLENGE",
        "id": challengeId,
        "metaGame": pars.metaGame,
        "numPlayers": pars.numPlayers,
        "standing": pars.standing,
        "seating": pars.seating,
        "variants": pars.variants,
        "challenger": pars.challenger,
        "challengees": pars.opponents, // users that were challenged
        "players": [pars.challenger], // users that have accepted
        "clockStart": pars.clockStart,
        "clockInc": pars.clockInc,
        "clockMax": pars.clockMax,
        "clockHard": pars.clockHard,
        "rated": pars.rated
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + userid, "sk": "USER" },
    ExpressionAttributeValues: { ":c": new Set([challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.issued :c",
  }));

  let list = [addChallenge, updateChallenger];
  pars.opponents.forEach(challengee => {
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER#" + challengee.id, "sk": "USER" },
        ExpressionAttributeValues: { ":c": new Set([challengeId]) },
        ExpressionAttributeNames: { "#c": "challenges" },
        UpdateExpression: "add #c.received :c",
      }))
    );
  })
  try {
    list.push(sendChallengedEmail(pars.challenger.name, pars.opponents, pars.metaGame));
  } catch (error) {
    logGetItemError(error);
    throw new Error("newChallenge: Failed to send emails");
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
    returnError("Failed to add challenge");
  }
}

async function newStandingChallenge(userid, pars) {
  const challengeId = crypto.randomUUID();
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "STANDINGCHALLENGE#" + pars.metaGame,
        "sk": challengeId,
        "id": challengeId,
        "metaGame": pars.metaGame,
        "numPlayers": pars.numPlayers,
        "standing": pars.standing,
        "seating": pars.seating,
        "variants": pars.variants,
        "challenger": pars.challenger,
        "players": [pars.challenger], // users that have accepted
        "clockStart": pars.clockStart,
        "clockInc": pars.clockInc,
        "clockMax": pars.clockMax,
        "clockHard": pars.clockHard,
        "rated": pars.rated
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + userid, "sk": "USER" },
    ExpressionAttributeValues: { ":c": new Set([pars.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.standing :c",
  }));
  
  const updateStandingChallengeCnt = updateStandingChallengeCount(pars.metaGame, 1);
  
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
    returnError("Failed to add challenge");
  }
}

async function sendChallengedEmail(challenger, opponents, metaGame) {
  const players = await getPlayers(opponents.map(o => o.id));
  console.log(players);
  metaGame = gameinfo.get(metaGame).name;
  await initi18n('en');
  let work = [];
  for (const player of players) {
    await changeLanguageForPlayer(player);
    const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeSubject"), i18n.t("ChallengeBody", { challenger, metaGame, "interpolation": {"escapeValue": false} }));
    work.push(sesClient.send(comm));
  }
  return Promise.all(work);
}

async function revokeChallenge(userid, pars, callback) {
  let challenge;
  let work;
  try {
    [challenge, work] = await removeChallenge(pars.id, pars.metaGame, pars.standing === true, true, userid);
  } catch (err) {
    logGetItemError(err);
    returnError("Failed to remove challenge", callback);
  }
  // send e-mails
  if (challenge !== undefined) {
    await initi18n('en');
    // Inform challenged
    let players = await getPlayers(challenge.challengees.map(c => c.id));
    const metaGame = gameinfo.get(challenge.metaGame).name;
    for (const player of players) {
      await changeLanguageForPlayer(player);
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame, "interpolation": {"escapeValue": false}}));
      work.push(sesClient.send(comm));
    };
    // Inform players that have already accepted
    players = await getPlayers(challenge.players.map(c => c.id).filter(id => id !== challenge.challenger.id));
    for (const player of players) {
      await changeLanguageForPlayer(player);
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame, "interpolation": {"escapeValue": false}}));
      work.push(sesClient.send(comm));
    };
  }

  await work;
  console.log("Successfully removed challenge" + pars.id);
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({
      message: "Successfully removed challenge" + pars.id
    }),
    headers
  });

}

async function respondedChallenge(userid, pars, callback) {
  const response = pars.response;
  const challengeId = pars.id;
  const standing = pars.standing === true;
  const metaGame = pars.metaGame;
  if (response) {
    // challenge was accepted
    let email;
    try {
      email = await acceptChallenge(userid, metaGame, challengeId, standing);
      console.log("Challenge" + challengeId + "successfully accepted.");
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: "Challenge " + challengeId + " successfully accepted."
        }),
        headers
      });
    } catch (err) {
      logGetItemError(err);
      returnError("Failed to accept challenge", callback);
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
          sesClient.send(comm);  
        };
      } catch (err) {
        logGetItemError(err);
      }
    }
  }
  else {
    // challenge was rejected
    let challenge;
    let work;
    try {
      [challenge, work] = await removeChallenge(pars.id, pars.metaGame, standing, false, userid);
      await work;
      console.log("Successfully removed challenge " + pars.id);
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully removed challenge " + pars.id
        }),
        headers
      });
    } catch (err) {
      logGetItemError(err);
      returnError("Failed to remove challenge", callback);
    }
    // send e-mails
    console.log(challenge);
    if (challenge !== undefined) {
      await initi18n('en');
      // Inform everyone (except the decliner, he knows).
      let players = await getPlayers(challenge.challengees.map(c => c.id).filter(id => id !== userid).concat(challenge.players.map(c => c.id)));
      const quitter = challenge.challengees.find(c => c.id === userid).name;
      const metaGame = gameinfo.get(challenge.metaGame).name;
      for (const player of players) {
        await changeLanguageForPlayer(player);
        const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRejectedSubject"), i18n.t("ChallengeRejectedBody", { quitter, metaGame, "interpolation": {"escapeValue": false} }));
        sesClient.send(comm);  
      };
    }
  }
}

async function removeChallenge(challengeId, metaGame, standing, revoked, quitter) {
  const chall = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE#" + challengeId,
        "sk": standing ? challengeId : "CHALLENGE"
      },
    }));
  if (chall.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return [undefined, undefined];
  }
  const challenge = chall.Item;
  if (revoked && challenge.challenger.id !== quitter)
    throw new Error(`${quitter} tried to revoke a challenge that they did not create.`);
  if (!revoked && !(challenge.players.find(p => p.id === quitter) || (challenge.standing !== true && challenge.challengees.find(p => p.id === quitter))))
    throw new Error(`${quitter} tried to leave a challenge that they are not part of.`);
  return [challenge, removeAChallenge(challenge, standing, revoked, false, quitter)];
}

// Remove the challenge either because the game has started, or someone withrew: either challenger revoked the challenge or someone withdrew an acceptance, or didn't accept the challenge.
async function removeAChallenge(challenge, standing, revoked, started, quitter) {
  let list = [];
  if (!standing) {
    // Remove from challenger
    const updateChallenger = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + challenge.challenger.id, "sk": "USER" },
      ExpressionAttributeValues: { ":c": new Set([challenge.id]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.issued :c",
    }));
    list.push(updateChallenger);
    // Remove from challenged
    challenge.challengees.forEach(challengee => {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER#" + challengee.id, "sk": "USER" },
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
      Key: { "pk": "USER#" + challenge.challenger.id, "sk": "USER" },
      ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challenge.id]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.standing :c",
    }));
    list.push(updateChallenger);
  }

  // Remove from players that have already accepted
  let playersToUpdate = [];
  if (standing || revoked || started) {
    playersToUpdate = challenge.players.filter(p => p.id != challenge.challenger.id);
  } else {
    playersToUpdate = [{"id": quitter}];
  }
  playersToUpdate.forEach(player => {
    console.log(`removing challenge ${standing ? challenge.metaGame + '#' + challenge.id : challenge.id} from ${player.id}`);
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER#" + player.id, "sk": "USER" },
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
            "pk": "CHALLENGE#" + challenge.id, "sk": "CHALLENGE"
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

async function updateStandingChallengeCount(metaGame, diff) {
  return ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "METAGAMES", "sk": "COUNTS" },
    ExpressionAttributeNames: { "#g": metaGame },
    ExpressionAttributeValues: {":n": diff},
    UpdateExpression: "add #g.standingchallenges :n",
  }));
}

async function acceptChallenge(userid, metaGame, challengeId, standing) {
  const challengeData = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": standing ? "STANDINGCHALLENGE#" + metaGame : "CHALLENGE#" + challengeId, "sk": standing ? challengeId : "CHALLENGE"
      },
    }));

  if (challengeData.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return;
  }

  const challenge = challengeData.Item;
  const challengees = standing ? undefined : challenge.challengees.filter(c => c.id != userid);
  if (!standing && challengees.length !== challenge.challengees.length - 1) {
    logGetItemError("userid wasn't a challengee");
    returnError('Unable to accept challenge', callback);
  }
  let players = challenge.players;
  if (challenge.players.length === challenge.numPlayers - 1) {
    // Enough players accepted. Start game.
    const gameId = crypto.randomUUID();
    let playerIDs = [];
    if (challenge.seating === 'random') {
      playerIDs = players.map(player => player.id);
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
    let whoseTurn = 0;
    let info = gameinfo.get(challenge.metaGame);
    if (info.flags !== undefined && info.flags.includes('simultaneous')) {
      whoseTurn = playerIDs.map(p => true);
    }
    const variants = challenge.variants;
    let engine;
    if (info.playercounts.length > 1)
      engine = GameFactory(challenge.metaGame, challenge.numPlayers, undefined, variants);
    else
      engine = GameFactory(challenge.metaGame, undefined, variants);
    const state = engine.serialize();
    const now = Date.now();
    let gamePlayers = playersFull.map(p => { return {"id": p.id, "name": p.name, "time": challenge.clockStart * 3600000 }});
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
          "pk": "GAME#" + gameId,
          "sk": "GAME",
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
    };
    let list = addToGameLists("CURRENTGAMES", game, now);
    console.log("list:");
    console.log(list);
  
    // Now remove the challenge and add the game to all players
    list.push(addGame);
    list.push(removeAChallenge(challenge, standing, false, true, null));

    // Update players
    playersFull.forEach(player => {
      let games = player.games;
      if (games === undefined)
        games = [];
      games.push(game);
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER#" + player.id, "sk": "USER" },
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
      returnError('Unable to update players and create game', callback);
      return undefined;
    }
  } else {
    // Still waiting on more players to accept.
    // Update challenge
    let newplayer;
    if (standing) {
      const playerFull = await getPlayers([userid]);
      newplayer = {"id" : playerFull[0].id, "name": playerFull[0].name };
    } else {
      newplayer = challenge.challengees.find(c => c.id == userid)
    }
    let updateChallenge;
    if (!standing || challenge.numPlayers == 2 || players.length !== 1) {
      challenge.challengees = challengees;
      players.push(newplayer);
      updateChallenge = ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: challenge
        }));
    } else {
      // need to duplicate the challenge, because numPlayers > 2 and we have our first accepter
      [challengeId, updateChallenge] = await duplicateStandingChallenge(challenge, newplayer);
    }
    console.log("challengeID", challengeId);
    console.log("updateChallenge", updateChallenge);
    // Update accepter
    const updateAccepter = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userid, "sk": "USER" },
      ExpressionAttributeValues: { ":c": new Set([standing ? challenge.metaGame + '#' + challengeId : challengeId]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.received :c add #c.accepted :c",
    }));

    await Promise.all([updateChallenge, updateAccepter]);
    return undefined;
  }
}

async function duplicateStandingChallenge(challenge, newplayer) {
  const challengeId = crypto.randomUUID();
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
    Key: { "pk": "USER#" + challenge.challenger.id, "sk": "USER" },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.standing :c",
  }));
    
  return [challengeId, Promise.all([addChallenge, updateStandingChallengeCnt, updateChallenger])];
}

async function getPlayers(playerIDs) {
  const list = playerIDs.map(id =>
    ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER#" + id, "sk": "USER"
        },
      })
    )
  );
  const players = await Promise.all(list);
  return players.map(player => player.Item);
}

function addToGameLists(type, game, now) {
  let work = [];
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
  game.players.forEach(player => {
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
  return Promise.all(work);
}

function removeFromGameLists(type, metaGame, gameStarted, id, players) {
  let work = [];
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
  players.forEach(player => {
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
  return Promise.all(work);
}

async function submitMove(userid, pars, callback) {
  let data = {};
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME#" + pars.id,
          "sk": "GAME"
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
  }
  let game = data.Item;
  console.log("got game in submitMove:");
  console.log(game);
  let engine = GameFactory(game.metaGame, game.state);
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
    returnError(`Unable to apply move ${pars.move}`, callback);
  }

  let player = game.players.find(p => p.id === userid);
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
  if (player.time - timeUsed < 0)
    player.time = game.clockInc * 3600000; // If the opponent didn't claim a timeout win, and player moved, pretend his remaining time was zero.
  else
    player.time = player.time - timeUsed + game.clockInc * 3600000;
  if (player.time > game.clockMax  * 3600000) player.time = game.clockMax * 3600000;
  // console.log("players", game.players);
  const playerIDs = game.players.map(p => p.id);
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
  };
  let myGame = {
    "id": game.id,
    "metaGame": game.metaGame,
    "players": game.players,
    "clockHard": game.clockHard,
    "toMove": game.toMove,
    "lastMoveTime": timestamp
  };
  let list = [];
  let newRatings = null;
  if ((game.toMove === "" || game.toMove === null)) {
    newRatings = updateRatings(game, players);
    myGame.seen = Date.now();
    addToGameLists("COMPLETEDGAMES", playerGame, timestamp);
    removeFromGameLists("CURRENTGAMES", game.metaGame, game.gameStarted, game.id, game.players);
  }
  game.lastMoveTime = timestamp;
  const updateGame = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: game
    }));
  list.push(updateGame);
  // Update players
  players.forEach((player, ind) => {
    let games = [];
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
          Key: { "pk": "USER#" + player.id, "sk": "USER" },
          ExpressionAttributeValues: { ":gs": games },
          UpdateExpression: "set games = :gs",
        }))
      );
    } else {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER#" + player.id, "sk": "USER" },
          ExpressionAttributeValues: { ":gs": games, ":rs": newRatings[ind] },
          UpdateExpression: "set games = :gs, ratings = :rs"
        }))
      );
    }
  });

  try {
    // await Promise.all(list);

    if (simultaneous)
      game.partialMove = game.players.map((p, i) => (p.id === userid ? game.partialMove.split(',')[i] : '')).join(',');

    callback(null, {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to update game ${pars.id}`, callback);
  }
  try {
    sendSubmittedMoveEmails(game, players, simultaneous, newRatings);
  }
  catch (error) {
    logGetItemError(error);
  }
}

function updateRatings(game, players) {
  console.log("game.numMoves", game.numMoves);
  if (!game.rated || game.numMoves < 3)
    return null;
  if (game.numPlayers !== 2)
    throw new Error(`Only 2 player games can be rated, game ${game.id}`);
  let rating1 = {rating: 1200, N: 0, wins: 0, draws: 0}
  let rating2 = {rating: 1200, N: 0, wins: 0, draws: 0}
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
  let ratings1 = players[0].ratings === undefined ? {} : players[0].ratings;
  let ratings2 = players[1].ratings === undefined ? {} : players[1].ratings;
  ratings1[game.metaGame] = rating1;
  ratings2[game.metaGame] = rating2;
  return [ratings1, ratings2];
}

function getK(N) {
  return (
    N < 10 ? 40 
    : N < 20 ? 30 
    : N < 40 ? 25 
    : 20
  );
}

async function sendSubmittedMoveEmails(game, players0, simultaneous, newRatings) {
  await initi18n('en');
  if (game.toMove !== '') {
    let playerIds = [];
    if (!simultaneous) {
      playerIds.push(game.players[game.toMove].id);
    }
    else if (game.toMove.every(b => b === true)) {
      playerIds = game.players.map(p => p.id);
    }
    const players = players0.filter(p => playerIds.includes(p.id));
    const metaGame = gameinfo.get(game.metaGame).name;
    for (const player of players) {
      await changeLanguageForPlayer(player);
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("YourMoveSubject"), i18n.t("YourMoveBody", { metaGame, "interpolation": {"escapeValue": false} }));
      sesClient.send(comm);
    }
  } else {
    // Game over
    const playerIds = game.players.map(p => p.id);
    const players = players0.filter(p => playerIds.includes(p.id));
    const metaGame = gameinfo.get(game.metaGame).name;
    for (const [ind, player] of players.entries()) {
      await changeLanguageForPlayer(player);
      let body;
      if (newRatings != null)
        body = i18n.t("GameOverWithRatingBody", { metaGame, "rating" : `${Math.round(newRatings[ind][game.metaGame].rating)}`, "interpolation": {"escapeValue": false} });
      else
        body = i18n.t("GameOverBody", { metaGame, "interpolation": {"escapeValue": false} });
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameOverSubject"), body);
      sesClient.send(comm);
    };
  }
}

function resign(userid, engine, game) {
  let player = game.players.findIndex(p => p.id === userid);
  if (player === undefined)
    throw new Error(`${userid} isn't playing in this game!`);
  engine.resign(player + 1);
  game.state = engine.serialize();
  game.toMove = "";
  game.winner = engine.winner;
  game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
}

function timeout(userid, engine, game) {
  if (game.toMove === '')
    throw new Error("Can't timeout a game that has already ended");
  // Find player that timed out
  let loser;
  if (Array.isArray(game.toMove)) {
    let minTime = 0;
    let minIndex = -1;
    const elapsed = Date.now() - game.lastMoveTime;
    game.toMove.forEach((p, i) => {
      if (p && game.players[i].time - elapsed < minTime) {
        minTime = game.players[i].time - elapsed;
        minIndex = i;
      }});
    if (minIndex !== -1) {
      loser = minIndex;
    } else {
      throw new Error("Nobody's time is up!");
    }
  } else {
    if (game.players[game.toMove].time - (Date.now() - game.lastMoveTime) < 0) {
      loser = game.toMove;
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

function drawaccepted(userid, engine, game, simultaneous) {
  if ((!simultaneous && game.players[game.toMove].id !== userid) || (simultaneous && !game.players.some((p,i) => game.toMove[i] && p.id === userid))) {
    throw new Error('It is not your turn!');
  }
  let player = game.players.find(p => p.id === userid);
  player.draw = "accepted";
  if (game.players.every(p => p.draw === "offered" || p.draw === "accepted")) {
    engine.draw();
    game.state = engine.serialize();
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  }
}

async function timeloss(player, gameid, timestamp) {
  let data = {};
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME#" + gameid,
          "sk": "GAME"
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    throw new Error(`Unable to get game ${gameid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  let game = data.Item;
  let engine = GameFactory(game.metaGame, game.state);
  engine.timeout(player + 1);
  game.state = engine.serialize();
  game.toMove = "";
  game.winner = engine.winner;
  game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  game.lastMoveTime = timestamp;
  const playerIDs = game.players.map(p => p.id);
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
  };
  let work = [];
  work.push(ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: game
    })));
  work.push(addToGameLists("COMPLETEDGAMES", playerGame, game.lastMoveTime));
  work.push(removeFromGameLists("CURRENTGAMES", game.metaGame, game.gameStarted, game.id, game.players));
  newRatings = updateRatings(game, players);

  // Update players
  players.forEach((player, ind) => {
    let games = [];
    player.games.forEach(g => {
      if (g.id === playerGame.id)
        games.push(playerGame);
      else
        games.push(g)
    });
    if (newRatings === null) {
      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER#" + player.id, "sk": "USER" },
        ExpressionAttributeValues: { ":gs": games },
        UpdateExpression: "set games = :gs"
      })));
    } else {
      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER#" + player.id, "sk": "USER" },
        ExpressionAttributeValues: { ":gs": games, ":rs": newRatings[ind] },
        UpdateExpression: "set games = :gs, ratings = :rs"
      })));
    }
  });
  return Promise.all(work);
}

function applySimultaneousMove(userid, move, engine, game) {
  let partialMove = game.partialMove;
  let moves = partialMove === undefined ? game.players.map(p => '') : partialMove.split(',');
  let cnt = 0;
  let found = false;
  for (let i = 0; i < game.numPlayers; i++) {
    if (game.players[i].id === userid) {
      found = true;
      if (moves[i] !== '' || !game.toMove[i]) {
        throw new Error('You have already submitted your move for this turn!');
      }
      moves[i] = move;
      game.toMove[i] = false;
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
    game.partialMove = game.players.map(p => '').join(',');
    if (engine.gameover) {
      game.toMove = "";
      game.winner = engine.winner;
      game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
    }
    else
      game.toMove = game.players.map(p => true);
  }
}

function applyMove(userid, move, engine, game) {
  // non simultaneous move game.
  if (game.players[game.toMove].id !== userid) {
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
    game.toMove = (game.toMove + 1) % game.players.length;
  console.log("done");
}

async function submitComment(userid, pars, callback) {
  let data = {};
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME#" + pars.id,
          "sk": "COMMENTS"
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get comments for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
  }
  let commentsData = data.Item;
  console.log("got comments in submitComment:");
  console.log(commentsData);
  if (commentsData === undefined) {
    commentsData = {
      "pk": "GAME#" + pars.id,
      "sk": "COMMENTS",
      "comments": []
    };
  }
  if (commentsData.comments.reduce((s, a) => s + 110 + Buffer.byteLength(s.comment,'utf8'), 0) < 360000) {
    let comment = {"comment": pars.comment.substring(0, 4000), "userId": userid, "moveNumber": pars.moveNumber, "timeStamp": Date.now()};
    commentsData.comments.push(comment);
    ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: commentsData
      }));
  }
}

async function updateMetaGameCounts(userId, pars, callback) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER#" + userId,
          "sk": "USER"
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      });
      return;
    }

    let games = [];
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
    const work = await Promise.all([Promise.all(currentgames), Promise.all(completedgames), Promise.all(standingchallenges)]);
    console.log("work", work);
    let metaGameCounts = {};
    games.forEach((game, ind) => metaGameCounts[game] = { "currentgames": work[0][ind].Items.length, "completedgames": work[1][ind].Items.length, "standingchallenges": work[2][ind].Items.length });
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
    returnError(`Unable to update meta game counts ${userId}`, callback);
  }
}

async function testAsync(userId, pars, callback) {
  // Make sure people aren't getting clever
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USER#" + userId,
          "sk": "USER"
        },
      }));
    if (user.Item === undefined || user.Item.admin !== true) {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      });
      return;
    }
    /*
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({"n": pars.N}),
      headers
    });
    */
    console.log(`Calling makeWork with ${pars.N}`);
    makeWork();
    console.log('Done calling makeWork');
    return {
      statusCode: 200,
      body: JSON.stringify({"n": pars.N}),
      headers
    };
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to test_async ${userId}`, callback);
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

function Set_toJSON(key, value) {
  if (typeof value === 'object' && value instanceof Set) {
    return [...value];
  }
  return value;
}

function shuffle(array) {
  let i = array.length,  j;

  while (i > 1) {
    j = Math.floor(Math.random() * i);
    i--;
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

async function changeLanguageForPlayer(player) {
  var lng = "en";
  if (player.language !== undefined)
    lng = player.language;
  if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
    console.log(`changed language to ${lng}`);
  }
}

function createSendEmailCommand(toAddress, player, subject, body) {
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
};

async function initi18n(language) {
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

function returnError(message) {
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
function logGetItemError(err) {
  if (!err) {
    console.error('Encountered error object was empty');
    return;
  }
  if (!err.code) {
    console.error(`An exception occurred, investigate and configure retry strategy. Error: ${JSON.stringify(err)}`);
    console.error(err);
    return;
  }
  // here are no API specific errors to handle for GetItem, common DynamoDB API errors are handled below
  handleCommonErrors(err);
}

// Handles errors during PutItem execution. Use recommendations in error messages below to
// add error handling specific to your application use-case.
function handlePutItemError(table, err) {
  console.error("An exception occurred while putting an item in table " + table);
  if (!err) {
    console.error('Encountered error object was empty');
    return;
  }
  if (!err.code) {
    console.error("Error:");
    console.error(err);
    return;
  }
  switch (err.code) {
    case 'ConditionalCheckFailedException':
      console.error(`Condition check specified in the operation failed, review and update the condition check before retrying. Error: ${err.message}`);
      return;
    case 'TransactionConflictException':
      console.error(`Operation was rejected because there is an ongoing transaction for the item, generally safe to retry ' +
       'with exponential back-off. Error: ${err.message}`);
       return;
    case 'ItemCollectionSizeLimitExceededException':
      console.error(`An item collection is too large, you're using Local Secondary Index and exceeded size limit of` +
        `items per partition key. Consider using Global Secondary Index instead. Error: ${err.message}`);
      return;
    default:
      break;
    // Common DynamoDB API errors are handled below
  }
  handleCommonErrors(err);
}

function handleCommonErrors(err) {
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
