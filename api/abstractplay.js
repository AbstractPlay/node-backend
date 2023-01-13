'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { gameinfo, GameFactory } = require('@abstractplay/gameslib');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const i18n = require('i18next');
const en = require('../locales/en/translation.json');

const REGION = "us-east-1";
const sesClient = new SESClient({ region: REGION });
const clnt = new DynamoDBClient({region: REGION});
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
module.exports.query = async (event, context, callback) => {
  console.log(event);
  const pars = event.queryStringParameters;
  switch (pars.query) {
    case "user_names":
      await userNames(callback);
      break;
    case "challenge_details":
      await challengeDetails(pars, callback);
      break;
    default:
      callback(null, {
        statusCode: 500,
        body: JSON.stringify({
          message: `Unable to execute unknown query '${query}'`
        }),
        headers
      });
  }
}

// This implementation mixes async and use of the callback. This is probably not ideal and raises
//    WARNING: Callback/response already delivered. Did your function invoke the callback and also return a promise?
// but it does seem to work and do what I want: in some cases (e.g. when sending e-mails), I'd like the lambda to return data to the front end before worrying about whether e-mails got sent or not. 
// In some cases DB updates can also be done after the response is sent. Trying to do this with a purely async approach causes the unresolved promises to be completed in the next lambda 
// invocation and will therefore only work if AWS Lambda chooses to reuse the execution context.
// Possibly the "right" way to do this is to use a non-async authQuery (with context.callbackWaitsForEmptyEventLoop = false) that calls all the async stuff (using https://javascript.info/task/async-from-regular).
module.exports.authQuery = async (event, context, callback) => {
  console.log("authQuery: ", event.body.query);
  const query = event.body.query;
  const pars = event.body.pars;
  switch (query) {
    case "me":
      await me(event.cognitoPoolClaims.sub, callback);
      break;
    case "new_profile":
      await newProfile(event.cognitoPoolClaims.sub, event.cognitoPoolClaims.email, pars, callback);
      break;
    case "new_challenge":
      await newChallenge(event.cognitoPoolClaims.sub, pars, callback);
      break;
      // return newChallenge2(event.cognitoPoolClaims.sub, pars);
    case "challenge_revoke":
      await revokeChallenge(event.cognitoPoolClaims.sub, pars, callback);
      break;
    case "challenge_response":
      await respondedChallenge(event.cognitoPoolClaims.sub, pars, callback);
      break;
    case "submit_move":
      await submitMove(event.cognitoPoolClaims.sub, pars, callback);
      break;
      case "submit_comment":
        await submitComment(event.cognitoPoolClaims.sub, pars, callback);
        break;
      case "get_game":
      await game(event.cognitoPoolClaims.sub, pars, callback);
      break;
    case "update_game_settings":
      await updateGameSettings(event.cognitoPoolClaims.sub, pars, callback);
      break;
    case "update_user_settings":
      await updateUserSettings(event.cognitoPoolClaims.sub, pars, callback);
      break;
    default:
      callback(null, {
        statusCode: 500,
        body: JSON.stringify({
          message: `Unable to execute unknown query '${query}'`
        }),
        headers
      });
  }
}

async function userNames(callback) {
  console.log("userNames: Scanning users.");
  try {
    const data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "USERS" },
        ExpressionAttributeNames: { "#pk": "pk", "#name": "name"},
        ProjectionExpression: "sk, #name"
      }));

    console.log("Scan succeeded. Got:");
    console.log(data);
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(data.Items.map(u => ({"id": u.sk, "name": u.name}))),
      headers
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to scan table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
  }
}

async function challengeDetails(pars, callback) {
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
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(data.Item),
      headers
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get challenge ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
  }
}

async function game(userid, pars, callback) {
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
    const data = await Promise.all([getGame, getComments]);
    console.log("Got:");
    console.log(data);
    let game = data[0].Item;
    // If the game is over update user to indicate they have seen the game end.
    if (game.toMove === "" || game.toMove === null) {
      setSeenTime(userid, pars.id);
    }
    // hide other player's simulataneous moves
    const flags = gameinfo.get(game.metaGame).flags;
    if (flags !== undefined && flags.includes('simultaneous') && game.partialMove !== undefined) {
      game.partialMove = game.partialMove.split(',').map((m,i) => game.players[i].id === userid ? m : '').join(',');
    }
    let comments = [];
    if (data[1].Item !== undefined && data[1].Item.comments)
      comments = data[1].Item.comments;
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify({"game": game, "comments": comments}),
      headers
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
  }
}

async function updateGameSettings(userid, pars, callback) {
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
      returnError(`Unable to update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
    }
    return callback(null, {
      statusCode: 200,
      headers
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get or update game ${pars.game} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
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
    console.log("got: ");
    console.log(user);
    if (user.Item === undefined) {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      });
      return;
    }
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to get user data for ${userid}`, callback);
  }

  let games = user.Item.games;
  let thegame = games.find(g => g.id == gameid);
  if (thegame !== undefined) {
    thegame.seen = Date.now();
  }
  ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + userid, "sk": "USER" },
    ExpressionAttributeValues: { ":gs": games },
    UpdateExpression: "set games = :gs",
  }));
}

async function updateUserSettings(userid, pars, callback) {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userid, "sk": "USER" },
      ExpressionAttributeValues: { ":ss": pars.settings },
      UpdateExpression: "set settings = :ss",
    }))
    console.log("Success - user settings updated");
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user settings for user ${userid}`,
      }),
      headers
    });
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to store user settings for user ${userid}`, callback);
  }
}

async function me(userId, callback) {
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
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
      });
      return;
    }
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
            timeloss(minIndex, game.id, game.lastMoveTime);
          }
        } else {
          if (game.players[game.toMove].time - (Date.now() - game.lastMoveTime) < 0) {
            game.lastMoveTime = game.lastMoveTime + game.players[game.toMove].time;
            const toMove = game.toMove;
            game.toMove = '';
            timeloss(toMove, game.id, game.lastMoveTime);
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
    if (user.Item.challenges !== undefined) {
      if (user.Item.challenges.issued !== undefined)
        challengesIssuedIDs = user.Item.challenges.issued;
      if (user.Item.challenges.received !== undefined)
        challengesReceivedIDs = user.Item.challenges.received;
      if (user.Item.challenges.accepted !== undefined)
        challengesAcceptedIDs = user.Item.challenges.accepted;
    }
    const challengesIssued = getChallenges(challengesIssuedIDs);
    const challengesReceived = getChallenges(challengesReceivedIDs);
    const challengesAccepted = getChallenges(challengesAcceptedIDs);
    const data = await Promise.all([challengesIssued, challengesReceived, challengesAccepted]);
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        "id": user.Item.id,
        "name": user.Item.name,
        "games": games,
        "settings": user.Item.settings,
        "challengesIssued": data[0],
        "challengesReceived": data[1],
        "challengesAccepted": data[2]
      }, Set_toJSON),
      headers
    });
    // Update last seen date for user
    ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userId, "sk": "USER" },
      ExpressionAttributeValues: { ":dt": Date.now(), ":gs": games },
      UpdateExpression: "set lastSeen = :dt, games = :gs"
    }));
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to get user data for ${userId}`, callback);
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
// This needs to be changed... Do we really now need to scan the entire table!? Do we need a secondary index? Is it worth it? Oh, maybe maintain a list of current games?
async function getGamesForUser(userId) {
  let games = [];
  let result = await 
    ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#t = :t",
        ExpressionAttributeValues: { ":t": 1 },
        ExpressionAttributeNames: { "#t": "type" },
        ProjectionExpression: "id, players, metaGame, clockHard, toMove, lastMoveTime",
        Limit: 2
      }));
  console.log("result", result);
  processGames(userId, result, games);
  let last = result.LastEvaluatedKey;
  console.log("last", last);
  while (last !== undefined) {
    result = await 
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#t = :t",
          ExpressionAttributeValues: { ":t": 1 },
          ExpressionAttributeNames: { "#t": "type" },
          ProjectionExpression: "id, players, metaGame, clockHard, toMove, lastMoveTime",
          Limit: 2,
          ExclusiveStartKey: last
        }));
    processGames(userId, result, games);
    last = result.LastEvaluatedKey;
    console.log("result", result);
  }
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
  var challenges = [];
  challengeIds.forEach(id => {
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
    )
  });
  const challenges2 = await Promise.all(challenges);
  let list = [];
  challenges2.forEach(challenge => {
    console.log(challenge.Item);
    console.log(challenge.Item.players)
    list.push(challenge.Item);
  });
  return list;
}

async function newProfile(userid, email, pars, callback) {
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
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: `Sucessfully stored user profile for user ${pars.name}`,
      }),
      headers
    });
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to store user profile for user ${pars.name}`, callback);
  }
}

async function newChallenge(userid, pars, callback) {
  const challengeId = crypto.randomUUID();
  console.log("newChallenge pars:", pars);
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "CHALLENGE#" + challengeId,
        "sk": "CHALLENGE",
        "id": challengeId,
        "metaGame": pars.metaGame,
        "numPlayers": pars.numPlayers,
        "seating": pars.seating,
        "variants": pars.variants,
        "challenger": pars.challenger,
        "challengees": pars.opponents, // users that were challenged
        "players": [pars.challenger], // users that have accepted
        "clockStart": pars.clockStart,
        "clockInc": pars.clockInc,
        "clockMax": pars.clockMax,
        "clockHard": pars.clockHard
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
    await Promise.all(list);
    console.log("Successfully added challenge" + challengeId);
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully added challenge",
      }),
      headers
    });
  } catch (err) {
    logGetItemError(err);
    returnError("Failed to add challenge", callback);
  }
  try {
    sendChallengedEmail(pars.challenger.name, pars.opponents, pars.metaGame);
  } catch (error) {
    logGetItemError(error);
  }
}

async function sendChallengedEmail(challenger, opponents, metaGame) {
  initi18n('fr');
  const players = await getPlayers(opponents.map(o => o.id));
  console.log(players);
  metaGame = gameinfo.get(metaGame).name;
  players.forEach(player => {
    const comm = createSendEmailCommand(player.email, player.name,  i18n.t("ChallengeSubject"), i18n.t("ChallengeBody", { challenger: challenger, metaGame: metaGame }));
    sesClient.send(comm);
  })
}

async function revokeChallenge(userid, pars, callback) {
  let challenge;
  try {
    challenge = await removeChallenge(pars.id, challenge);
    console.log("Successfully removed challenge" + pars.id);
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully removed challenge" + pars.id
      }),
      headers
    });
  } catch (err) {
    logGetItemError(err);
    returnError("Failed to remove challenge", callback);
  }
  // send e-mails
  if (challenge !== undefined && challenge.Item !== undefined) {
    initi18n('fr');
    // Inform challenged
    let players = await getPlayers(challenge.Item.challengees.map(c => c.id));
    const metaGame = gameinfo.get(challenge.Item.metaGame).name;
    players.forEach(player => {
      const comm = createSendEmailCommand(players[0].email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.Item.challenger.name, metaGame}));
      sesClient.send(comm);  
    });
    // Inform players that have already accepted
    players = await getPlayers(challenge.Item.players.map(c => c.id).filter(id => id !== challenge.Item.challenger.id));
    players.forEach(player => {
      const comm = createSendEmailCommand(players[0].email, player.name, i18n.t("ChallengeRevokedSubject"), i18n.t("ChallengeRevokedBody", { name: challenge.Item.challenger.name, metaGame}));
      sesClient.send(comm);  
    });
  }
}

async function respondedChallenge(userid, pars, callback) {
  const response = pars.response;
  const challengeId = pars.id;
  if (response) {
    // challenge was accepted
    let email;
    try {
      email = await acceptChallenge(userid, challengeId);
      console.log("Challenge" + challengeId + "successfully accepted.");
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: "Challenge" + challengeId + "successfully accepted."
        }),
        headers
      });
    } catch (err) {
      logGetItemError(err);
      returnError("Failed to accept challenge", callback);
    }
    if (email !== undefined) {
      initi18n('fr');
      try {
        email.players.forEach((player, ind) => {
          let body = i18n.t("GameStartedBody", { metaGame: email.metaGame });
          if (ind === 0 || email.simultaneous) {
            body += " " + i18n.t("YourMove");
          }
          const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameStartedSubject"), body);
          sesClient.send(comm);  
        });
      } catch (err) {
        logGetItemError(err);
      }
    }
  }
  else {
    // challenge was rejected
    let challenge;
    try {
      challenge = await removeChallenge(pars.id, userid);
      console.log("Successfully removed challenge" + pars.id);
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully removed challenge" + pars.id
        }),
        headers
      });
    } catch (err) {
      logGetItemError(err);
      returnError("Failed to remove challenge", callback);
    }
    // send e-mails
    console.log(challenge);
    if (challenge !== undefined && challenge.Item !== undefined) {
      initi18n('fr');
      // Inform everyone (except the decliner, he knows).
      let players = await getPlayers(challenge.Item.challengees.map(c => c.id).filter(id => id !== userid).concat(challenge.Item.players.map(c => c.id)));
      const quitter = challenge.Item.challengees.find(c => c.id === userid).name;
      const metaGame = gameinfo.get(challenge.Item.metaGame).name;
      players.forEach(player => {
        const comm = createSendEmailCommand(players[0].email, player.name, i18n.t("ChallengeRejectedSubject"), i18n.t("ChallengeRejectedBody", { quitter, metaGame }));
        sesClient.send(comm);  
      });
    }
  }
}

async function removeChallenge(challengeId) {
  const challenge = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "CHALLENGE#" + challengeId,
        "sk": "CHALLENGE"
      },
    }));
  if (challenge.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return { challenge, work: []};
  }
  await Promise.all(await removeAChallenge(challenge.Item));
  return challenge;
}

async function removeAChallenge(challenge) {
  // Remove from challenger
  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER#" + challenge.challenger.id, "sk": "USER" },
    ExpressionAttributeValues: { ":c": new Set([challenge.id]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "delete #c.issued :c",
  }));
  let list = [updateChallenger];

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
  
  // Remove from players that have already accepted
  challenge.players.filter(p => p.id != challenge.challenger.id).forEach(player => {
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER#" + player.id, "sk": "USER" },
        ExpressionAttributeValues: { ":c": new Set([challenge.id]) },
        ExpressionAttributeNames: { "#c": "challenges" },
        UpdateExpression: "delete #c.accepted :c",
      }))
    );
  });

  // Remove challenge
  list.push(
    ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "CHALLENGE#" + challenge.id, "sk": "CHALLENGE"
        },
      }))
  );

  return list;
}

async function acceptChallenge(userid, challengeId) {
  const challengeData = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "CHALLENGE#" + challengeId, "sk": "CHALLENGE"
      },
    }));

  if (challengeData.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return;
  }

  const challenge = challengeData.Item;
  const challengees = challenge.challengees.filter(c => c.id != userid);
  if (challengees.length !== challenge.challengees.length - 1) {
    logGetItemError("userid wasn't a challengee");
    returnError('Unable to accept challenge', callback);
  }
  let players = challenge.players;
  players.push(challenge.challengees.find(c => c.id == userid));
  if (players.length === challenge.numPlayers) {
    // Enough players accepted. Start game.
    const gameId = crypto.randomUUID();
    let playerIDs = [];
    if (challenge.seating === 'random') {
      playerIDs = players.map(player => player.id);
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
      whoseTurn = players.map(p => true);
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
      if (players.length > 2 && info.flags !== undefined && info.flags.includes('rotate90')) {
        rot = 90;
      }
      for (let i = 1; i < players.length; i++) {
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
    list = list.concat(await removeAChallenge(challenge));

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
    challenge.challengees = challengees;
    const updateChallenge = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: challenge
      }));
    // Update accepter
    const updateAccepter = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userid, "sk": "USER" },
      ExpressionAttributeValues: { ":c": new Set([challengeId]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.received :c add #c.accepted :c",
    }));

    await Promise.all([updateChallenge, updateAccepter]);
    return undefined;
  }
}

async function getPlayers(playerIDs) {
  console.log("playerIDs: ", playerIDs);
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
  console.log(players);
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
  return work;
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
  return work;
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
  console.log("got players");

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
  if ((game.toMove === "" || game.toMove === null)) {
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
  players.forEach(player => {
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
    sendSubmittedMoveEmails(game, pars, simultaneous);
  }
  catch (error) {
    logGetItemError(error);
  }
}

async function sendSubmittedMoveEmails(game, pars, simultaneous) {
  initi18n('fr');
  if (game.toMove != '') {
    let playerIds = [];
    if (!simultaneous) {
      playerIds.push(game.players[game.toMove].id);
    }
    else if (game.toMove.every(b => b === true)) {
      playerIds = game.players.map(p => p.id);
    }
    const players = await getPlayers(playerIds);
    console.log(players);
    const metaGame = gameinfo.get(game.metaGame).name;
    players.forEach(player => {
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("YourMoveSubject"), i18n.t("YourMoveBody", { metaGame }));
      sesClient.send(comm);
    })
  }
  else {
    const playerIds = game.players.map(p => p.id);
    const players = await getPlayers(playerIds);
    console.log(players);
    const metaGame = gameinfo.get(game.metaGame).name;
    players.forEach(player => {
      const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameOverSubject"), i18n.t("GameOverBody", { metaGame }));
      sesClient.send(comm);
    });
  }
}

function resign(userid, engine, game) {
  let player = game.players.findIndex(p => p.id === userid);
  if (player === undefined)
    throw new Error(`${userid} isn't playing in this game!`);
  engine.resign(player + 1);
  game.state = engine.serialize();
  game.toMove = "";
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
    returnError(`Unable to get game ${gameid} from table ${process.env.ABSTRACT_PLAY_TABLE}`, callback);
  }
  let game = data.Item;
  let engine = GameFactory(game.metaGame, game.state);
  engine.timeout(player + 1);
  game.state = engine.serialize();
  game.toMove = "";
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
  ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: game
    }));
  addToGameLists("COMPLETEDGAMES", playerGame, game.lastMoveTime);
  removeFromGameLists("CURRENTGAMES", game.metaGame, game.gameStarted, game.id, game.players);

  // Update players
  players.forEach(player => {
    let games = [];
    player.games.forEach(g => {
      if (g.id === playerGame.id)
        games.push(playerGame);
      else
        games.push(g)
    });
    ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + player.id, "sk": "USER" },
      ExpressionAttributeValues: { ":gs": games },
      UpdateExpression: "set games = :gs",
    }));
  });
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
    if (engine.gameover)
      game.toMove = "";
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
  if (engine.gameover)
    game.toMove = "";
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

function createSendEmailCommand(toAddress, player, subject, body) {
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

function initi18n(language) {
  i18n.init({
    lng: language,
    fallbackLng: 'en',
    debug: true,
    resources: {
      en: {
        translation: en
      }
    }
  });
}

function returnError(message, callback) {
  callback(null, {
    statusCode: 500,
    body: JSON.stringify({
      message: message
    }),
    headers
  });
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
