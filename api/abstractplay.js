'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { gameinfo, GameFactory } = require('@abstractplay/gameslib');
const clnt = new DynamoDBClient({region: 'us-east-1'});
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
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
  }
}

module.exports.authQuery = async (event, context, callback) => {
  console.log(event.body);
  const query = event.body.query;
  const pars = event.body.pars;
  switch (query) {
    case "me":
      await me(event.cognitoPoolClaims.sub, callback);
      break;
    case "new_profile":
      await newProfile(event.cognitoPoolClaims.sub, pars, callback);
      break;
    case "new_challenge":
      await newChallenge(event.cognitoPoolClaims.sub, pars, callback);
      break;
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
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
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
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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
      let moves = game.players.map(p => '');
      for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].id === userid) {
          moves[i] = game.partialMove.split(',')[i];
        }
      }
      game.partialMove = moves.join(',');
    }
    let comments = [];
    if (data[1].Item !== undefined && data[1].Item.comments)
      comments = data[1].Item.comments;
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify({"game": game, "comments": comments}),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
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
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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
    console.log("got: ");
    console.log(user);
    if (user.Item === undefined) {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({}),
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
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
    if (user.Item.challenges !== undefined) {
      if (user.Item.challenges.issued !== undefined)
        challengesIssuedIDs = user.Item.challenges.issued;
      if (user.Item.challenges.received !== undefined)
        challengesReceivedIDs = user.Item.challenges.received;
    }
    const challengesIssued = getChallenges(challengesIssuedIDs);
    const challengesReceived = getChallenges(challengesReceivedIDs);
    const data = await Promise.all([challengesIssued, challengesReceived]);
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        "id": user.Item.id,
        "name": user.Item.name,
        "games": games,
        "settings": user.Item.settings,
        "challengesIssued": data[0],
        "challengesReceived": data[1]
      }, Set_toJSON),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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

async function newProfile(userid, pars, callback) {
  const data = {
      "pk": "USER#" + userid,
      "sk": "USER",
      "id": userid,
      "name": pars.name,
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
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    logGetItemError(err);
    returnError(`Unable to store user profile for user ${pars.name}`, callback);
  }
}

async function newChallenge(userid, pars, callback) {
  const challengeId = crypto.randomUUID();
  console.log(pars);
  const addChallenge = ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: {
        "pk": "CHALLENGE#" + challengeId,
        "sk": "CHALLENGE",
        "id": challengeId,
        "metaGame": pars.metaGame,
        "numPlayers": pars.numPlayers,
        "variants": pars.variants,
        "challenger": pars.challenger,
        "challengees": pars.challengees, // users that were challenged
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
  pars.challengees.forEach(challengee => {
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
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    logGetItemError(err);
    returnError("Failed to add challenge", callback);
  }
}

async function revokeChallenge(userid, pars, callback) {
  try {
    await removeChallenge(pars.id);
    console.log("Successfully removed challenge" + pars.id);
    callback(null, {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully removed challenge" + pars.id
      }),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    logGetItemError(err);
    returnError("Failed to remove challenge", callback);
  }
}

async function respondedChallenge(userid, pars, callback) {
  const response = pars.response;
  const challengeId = pars.id;
  if (response) {
    // challenge was accepted
    try {
      await acceptChallenge(userid, challengeId);
      console.log("Challenge" + challengeId + "successfully accepted.");
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: "Challenge" + challengeId + "successfully accepted."
        }),
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      logGetItemError(err);
      returnError("Failed to accept challenge", callback);
    }
  }
  else {
    // challenge was rejected
    try {
      await removeChallenge(pars.id);
      console.log("Successfully removed challenge" + pars.id);
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: "Successfully removed challenge" + pars.id
        }),
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      logGetItemError(err);
      returnError("Failed to remove challenge", callback);
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
    return;
  }
  return removeAChallenge(challenge.Item);
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
  const challenge = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "CHALLENGE#" + challengeId, "sk": "CHALLENGE"
      },
    }));

  if (challenge.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return;
  }

  if (challenge.Item.players.length + 1 == challenge.Item.numPlayers) {
    // Enough players accepted. Start game.
    const gameId = crypto.randomUUID();
    let playerIDs = challenge.Item.players.map(player => player.id); // This should be updated once we implement different start orders
    playerIDs.push(challenge.Item.challengees.find(c => c.id == userid).id);
    const players = await getPlayers(playerIDs);
    let whoseTurn = 0;
    let info = gameinfo.get(challenge.Item.metaGame);
    if (info.flags !== undefined && info.flags.includes('simultaneous')) {
      whoseTurn = players.map(p => true);
    }
    const variants = challenge.Item.variants;
    let engine;
    if (info.playercounts.length > 1)
      engine = GameFactory(challenge.Item.metaGame, challenge.Item.numPlayers, undefined, variants);
    else
      engine = GameFactory(challenge.Item.metaGame, undefined, variants);
    const state = engine.serialize();
    const now = Date.now();
    let gamePlayers = players.map(p => { return {"id": p.id, "name": p.name, "time": challenge.Item.clockStart * 3600000 }}); // players, in order (todo)
    if (info.flags !== undefined && info.flags.includes('perspective')) {
      let rot = 180;
      if (players.length > 2 && info.flags !== undefined && info.flags.includes('rotate90')) {
        rot = 90;
      }
      for (let i = 1; i < players.length; i++) {
        gamePlayers[1].settings = {"rotate": i * rot};
      }
    }
    const addGame = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "GAME#" + gameId,
          "sk": "GAME",
          "id": gameId,
          "metaGame": challenge.Item.metaGame,
          "numPlayers": challenge.Item.numPlayers,
          "players": gamePlayers,
          "clockStart": challenge.Item.clockStart,
          "clockInc": challenge.Item.clockInc,
          "clockMax": challenge.Item.clockMax,
          "clockHard": challenge.Item.clockHard,
          "state": state,
          "toMove": whoseTurn,
          "lastMoveTime": now,
          "gameStarted": now
        }
      }));
    // this should be all the info we want to show on the "my games" summary page.
    const game = {
      "id": gameId,
      "metaGame": challenge.Item.metaGame,
      "players": players.map(p => {return {"id": p.id, "name": p.name, "time": challenge.Item.clockStart * 3600000}}),
      "clockHard": challenge.Item.clockHard,
      "toMove": whoseTurn,
      "lastMoveTime": now,
    };
    let list = addToGameLists("CURRENTGAMES", game, now);
    console.log("list:");
    console.log(list);
  
    // Now remove the challenge and add the game to all players
    list.push(addGame);
    list = list.concat(removeAChallenge(challenge.Item));

    // Update players
    players.forEach(player => {
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
    }
    catch (error) {
      logGetItemError(error);
      returnError('Unable to update players and create game', callback);
    }
  } else {
    // Still waiting on more players to accept.
    // Update challenge
    const challengees = challenge.Item.challengees.filter(c => c.id != userid);
    const players = challenge.Item.players.push(challenge.Item.challengees.find(c => c.id == userid));
    const updateChallenge = ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": "CHALLENGE#" + challengeId,
          "sk": "CHALLENGE",
          "id": challengeId,
          "challengees": challengees, // users that were challenged
          "players": players // users that have accepted
        }
      }));
    // Update accepter
    const updateAccepter = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER#" + userid, "sk": "USER" },
      ExpressionAttributeValues: { ":c": new Set([challengeId]) },
      ExpressionAttributeNames: { "#c": "challenges" },
      UpdateExpression: "delete #c.received :c, add #c.accepted :c",
    }));

    await Promise.all([updateChallenge, updateAccepter]);
  }
}

async function getPlayers(playerIDs) {
  console.log(playerIDs);
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
      drawaccepted(userid, engine, game);
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

    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(game),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to update game ${pars.id}`, callback);
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

function drawaccepted(userid, engine, game) {
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
  let moves = [];
  if (partialMove === undefined)
    moves = game.players.map(p => '');
  else
    moves = partialMove.split(',');
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
  engine.move(move);
  game.state = engine.serialize();
  if (engine.gameover)
    game.toMove = "";
  else
    game.toMove = (game.toMove + 1) % game.players.length;
  engine.st
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
  let comment = {"comment": pars.comment, "userId": userid, "moveNumber": pars.moveNumber, "timeStamp": Date.now()};
  commentsData.comments.push(comment);
  ddbDocClient.send(new PutCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: commentsData
    }));
}

function Set_toJSON(key, value) {
  if (typeof value === 'object' && value instanceof Set) {
    return [...value];
  }
  return value;
}

function returnError(message, callback) {
  callback(null, {
    statusCode: 500,
    body: JSON.stringify({
      message: message
    }),
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
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
