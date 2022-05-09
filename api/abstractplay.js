'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { gameinfo, GameFactory } = require('@abstractplay/gameslib');
const clnt = new DynamoDBClient({region: 'us-east-1'});
const ddbDocClient = DynamoDBDocumentClient.from(clnt);

module.exports.query = async (event, context, callback) => {
  console.log(event);
  const pars = event.queryStringParameters;
  switch (pars.query) {
    case "list_games":
      await listGames(callback);
      break;
    case "game_names":
      await gameNames(callback);
      break;
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

async function listGames(callback) {
  console.log("listGames: Scanning meta_games table.");
  try {
    const data = await ddbDocClient.send(
      new ScanCommand({
        TableName: process.env.META_GAMES_TABLE,
        ExpressionAttributeNames: {"#name": "name"},
        ProjectionExpression: "#name, description, publisher, sampleRep"
      }));
    console.log("Scan succeeded. Got:");
    console.log(data);
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(data.Items),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError("Unable to scan game table ${process.env.META_GAMES_TABLE}", callback);
  }
};

async function gameNames(callback) {
  console.log("gameNames: Scanning meta_games table.");
  try {
    const data = await ddbDocClient.send(
      new ScanCommand({
        TableName: process.env.META_GAMES_TABLE,
        ExpressionAttributeNames: {"#name": "name"},
        ProjectionExpression: "#name"
      }));
    console.log("Scan succeeded. Got:");
    console.log(data);
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(data.Items),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to scan game table ${process.env.META_GAMES_TABLE}`, callback);
  }
};

async function userNames(callback) {
  console.log("userNames: Scanning users table.");
  try {
    const data = await ddbDocClient.send(
      new ScanCommand({
        TableName: process.env.USERS_TABLE,
        ExpressionAttributeNames: {"#name": "name"},
        ProjectionExpression: "id, #name"
      }));
    console.log("Scan succeeded. Got:");
    console.log(data);
    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(data.Items),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to scan table ${process.env.USERS_TABLE}`, callback);
  }
}

async function challengeDetails(pars, callback) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.CHALLENGES_TABLE,
        Key: {
          "id": pars.id
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
    returnError(`Unable to get challenge ${pars.id} from table ${process.env.CHALLENGES_TABLE}`, callback);
  }
}

async function game(userid, pars, callback) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.GAMES_TABLE,
        Key: {
          "id": pars.id,
          "type": 1
        },
      }));
    console.log("Got:");
    console.log(data);
    let game = data.Item;
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
    returnError(`Unable to get game ${pars.id} from table ${process.env.GAMES_TABLE}`, callback);
  }
}

async function updateGameSettings(userid, pars, callback) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.GAMES_TABLE,
        Key: {
          "id": pars.game,
          "type": 1
        },
      }));
    console.log("Got:");
    console.log(data);
    let game = data.Item;
    let player = game.players.find(p => p.id === userid);
    player.settings = pars.settings;
    try {
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.GAMES_TABLE,
          Item: game
        }));
    }
    catch (error) {
      logGetItemError(error);
      returnError(`Unable to update game ${pars.game} from table ${process.env.GAMES_TABLE}`, callback);
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
    returnError(`Unable to get or update game ${pars.game} from table ${process.env.META_GAMES_TABLE}`, callback);
  }
}

async function updateUserSettings(userid, pars, callback) {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { "id": userid },
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
  try {
    const user = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE,
        Key: {
          "id": userId
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
        id: user.Item.id,
        name: user.Item.name,
        games: user.Item.games,
        settings: user.Item.settings,
        challengesIssued: data[0],
        challengesReceived: data[1]
      }, Set_toJSON),
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
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
          TableName: process.env.GAMES_TABLE,
          Key: {
            "id": id,
            "type": 1
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

async function getChallenges(challengeIds) {
  var challenges = [];
  challengeIds.forEach(id => {
    challenges.push(
      ddbDocClient.send(
        new GetCommand({
          TableName: process.env.CHALLENGES_TABLE,
          Key: {
            "id": id
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
      "id": userid,
      "name": pars.name,
      "consent": pars.consent,
      "anonymous": pars.anonymous,
      "country": pars.country,
      "tagline": pars.tagline,
      "challenges" : {}
    };
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.USERS_TABLE,
      Item: data
    }));
    console.log("Success - item added or updated", data);
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
    TableName: process.env.CHALLENGES_TABLE,
      Item: {
        "id": challengeId,
        "metaGame": pars.metaGame,
        "numPlayers": pars.numPlayers,
        "variants": pars.variants,
        "challenger": pars.challenger,
        "challengees": pars.challengees, // users that were challenged
        "players": [pars.challenger], // users that have accepted
        "clockStart": 72,
        "clockInc": 24,
        "clockMax": 240
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.USERS_TABLE,
    Key: { "id": userid },
    ExpressionAttributeValues: { ":c": new Set([challengeId]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "add #c.issued :c",
  }));

  let list = [addChallenge, updateChallenger];
  pars.challengees.forEach(challengee => {
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { "id": challengee.id },
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
      TableName: process.env.CHALLENGES_TABLE,
      Key: {
        "id": challengeId
      },
    }));
  if (challenge.Item === undefined) {
    // The challenge might have been revoked or rejected by another user (while you were deciding)
    console.log("Challenge not found");
    return;
  }
  await removeAChallenge(challenge.Item);
}

async function removeAChallenge(challenge) {
  // Remove from challenger
  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.USERS_TABLE,
    Key: { "id": challenge.challenger.id },
    ExpressionAttributeValues: { ":c": new Set([challenge.id]) },
    ExpressionAttributeNames: { "#c": "challenges" },
    UpdateExpression: "delete #c.issued :c",
  }));
  let list = [updateChallenger];

  // Remove from challenged
  challenge.challengees.forEach(challengee => {
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { "id": challengee.id },
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
        TableName: process.env.USERS_TABLE,
        Key: { "id": player.id },
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
        TableName: process.env.CHALLENGES_TABLE,
        Key: {
          "id": challenge.id
        },
      }))
  );

  await Promise.all(list);
}

async function acceptChallenge(userid, challengeId) {
  const challenge = await ddbDocClient.send(
    new GetCommand({
      TableName: process.env.CHALLENGES_TABLE,
      Key: {
        "id": challengeId
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
      engine = GameFactory(challenge.Item.metaGame, game.numPlayers, undefined, variants);
    else
      engine = GameFactory(challenge.Item.metaGame, undefined, variants);
    const state = engine.serialize();
    const addGame = ddbDocClient.send(new PutCommand({
      TableName: process.env.GAMES_TABLE,
        Item: {
          "id": gameId,
          "type": 1,
          "metaGame": challenge.Item.metaGame,
          "numPlayers": challenge.Item.numPlayers,
          "players": players.map(p => {return {"id": p.id, "name": p.name}}), // players, in order (todo)
          "clockStart": challenge.Item.clockStart,
          "clockInc": challenge.Item.clockInc,
          "clockMax": challenge.Item.clockMax,
          "state": state,
          "toMove": whoseTurn
        }
      }));
    // this should be all the info we want to show on the "my games" summary page.
    const game = {
      "id": gameId,
      "metaGame": challenge.Item.metaGame,
      "players": players.map(p => {return {"id": p.id, "name": p.name}}),
      "toMove": whoseTurn
    };

    // Now remove the challenge and add the game to all players
    let list = [addGame, removeAChallenge(challenge.Item)];

    // Update players
    players.forEach(player => {
      let games = player.games;
      if (games === undefined)
        games = [];
      games.push(game);
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.USERS_TABLE,
          Key: { "id": player.id },
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
      TableName: process.env.CHALLENGES_TABLE,
        Item: {
          "id": challengeId,
          "challengees": challengees, // users that were challenged
          "players": players // users that have accepted
        }
      }));
    // Update accepter
    const updateAccepter = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { "id": userid },
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
        TableName: process.env.USERS_TABLE,
        Key: {
          "id": id
        },
      })
    )
  );
  const players = await Promise.all(list);
  console.log(players);
  return players.map(player => player.Item);
}

async function submitMove(userid, pars, callback) {
  let data = {};
  try {
    data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.GAMES_TABLE,
        Key: {
          "id": pars.id,
          "type": 1
        },
      }));
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to get game ${pars.id} from table ${process.env.GAMES_TABLE}`, callback);
  }
  let game = data.Item;
  console.log("got game in submitMove:");
  console.log(game);
  let engine;
  let info = gameinfo.get(game.metaGame);
  engine = GameFactory(game.metaGame, game.state);
  const flags = gameinfo.get(game.metaGame).flags;
  const simultaneous = flags !== undefined && flags.includes('simultaneous');
  let newstate;
  try {
    if (pars.move === "resign") {
      resign(userid, engine, game, newstate);
    } else if (simultaneous) {
      applySimultaneousMove(userid, pars.move, engine, game, newstate);
    }
    else {
      applyMove(userid, pars.move, engine, game, newstate);
    }
  }
  catch (error) {
    logGetItemError(error);
    returnError(`Unable to apply move ${pars.move}`, callback);
  }
  const playerIDs = game.players.map(p => p.id);
  // TODO: We are updating players and their games. This should be put in some kind of critical section!
  const players = await getPlayers(playerIDs);
  // this should be all the info we want to show on the "my games" summary page.
  const playerGame = {
    "id": game.id,
    "metaGame": game.metaGame,
    "players": game.players,
    "toMove": game.toMove
  };

  const updateGame = ddbDocClient.send(new PutCommand({
    TableName: process.env.GAMES_TABLE,
      Item: game
    }));
  let list = [updateGame];

  // Update players
  players.forEach(player => {
    let games = [];
    player.games.forEach(g => {
      if (g.id === playerGame.id)
        games.push(playerGame);
      else
        games.push(g)
    });
    list.push(
      ddbDocClient.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { "id": player.id },
        ExpressionAttributeValues: { ":gs": games },
        UpdateExpression: "set games = :gs",
      }))
    );
  });

  try {
    await Promise.all(list);

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

function resign(userid, engine, game, newstate) {
  let player = game.players.findIndex(p => p.id === userid);
  if (player === undefined)
    throw new Error(`${userid} isn't playing in this game!`);
  engine.resign(player + 1);
  newstate = engine.serialize();
  game.state = newstate;
}

function applySimultaneousMove(userid, move, engine, game, newstate) {
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
    newstate = engine.serialize();
    game.state = newstate;
    game.partialMove = game.players.map(p => '').join(',');
    game.toMove = game.players.map(p => true);
  }
}

function applyMove(userid, move, engine, game, newstate) {
  // non simultaneous move game.
  if (game.players[game.toMove].id !== userid) {
    throw new Error('It is not your turn!');
  }
  engine.move(move);
  newstate = engine.serialize();
  game.state = newstate;
  game.toMove = (game.toMove + 1) % game.players.length;  
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
