/* eslint-disable @typescript-eslint/ban-ts-comment */
'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
// import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory, GameBase, GameBaseSimultaneous, type APGamesInformation } from '@abstractplay/gameslib';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import i18n from 'i18next';
import en from '../locales/en/apback.json';
import fr from '../locales/fr/apback.json';
import it from '../locales/it/apback.json';
import { Handler } from "aws-lambda";

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendCommandWithRetry(command: any, maxRetries = 8, initialDelay = 100, maxDelay = 5000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            // @ts-ignore
            return await ddbDocClient.send(command);
        } catch (err: any) {
            if (['ThrottlingException', 'ProvisionedThroughputExceededException', 'InternalServerError', 'ServiceUnavailable'].includes(err.name)) {
                retries++;
                if (retries >= maxRetries) {
                    console.error(`Command failed after ${maxRetries} retries.`);
                    throw err;
                }
                const delay = Math.min(initialDelay * Math.pow(2, retries - 1), maxDelay);
                const jitter = delay * 0.1 * Math.random();
                console.log(`Retryable error (${err.name}) caught. Retrying in ${Math.round(delay + jitter)}ms...`);
                await sleep(delay + jitter);
            } else {
                throw err;
            }
        }
    }
}

// Types
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
            tournamentStart: boolean;
            tournamentEnd: boolean;
        }
    }
};

export type UserLastSeen = {
  id: string;
  name: string;
  lastSeen?: number;
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
  gamesUpdate?: number;
  games: Game[];
  challenges: {
    issued: string[];
    received: string[];
    accepted: string[];
    standing: string[];
  }
  admin: boolean | undefined;
  language: string;
  country: string;
  lastSeen?: number;
  settings: UserSettings;
  ratings?: {
    [metaGame: string]: Rating
  };
  stars?: string[];
  tags?: TagList[];
  palettes?: Palette[];
  mayPush?: boolean;
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
  note?: string;
  seen?: number;
  winner?: number[];
  numMoves?: number;
  gameStarted?: number;
  gameEnded?: number;
  lastChat?: number;
  variants?: string[];
}

type Division = {
  numGames: number;
  numCompleted: number;
  processed: boolean;
  winnerid?: string;
  winner?: string;
};

type Tournament = {
  pk: string;
  sk: string;
  id: string;
  metaGame: string;
  variants: string[];
  number: number;
  started: boolean;
  dateCreated: number;
  datePreviousEnded: number; // 0 means either the first tournament or a restart of the series (after it stopped because not enough participants), 3000000000000 means previous tournament still running.
  nextid?: string;
  dateStarted?: number;
  dateEnded?: number;
  divisions?: {
    [division: number]: Division;
  };
  players?: TournamentPlayer[]; // only on archived tournaments
  waiting?: boolean; // tournament does not yet have 4 players
};

type TournamentPlayer = {
  pk: string;
  sk: string;
  playerid: string;
  playername: string;
  once?: boolean;
  division?: number;
  score?: number;
  tiebreak?: number;
  rating?: number;
  timeout?: boolean;
};

type TagList = {
  meta: string;
  tags: string[];
}

type Palette = {
    name: string;
    colours: string[];
}

export const handler: Handler = async (event: any, context?: any) => {
  let count = 0;
  let newcount = 0;
  let cancelledcount = 0;
  let waitingcount = 0;
  try {
    console.log("Getting TOURNAMENTs");
    const tournamentsData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENT" },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    const tournaments = tournamentsData.Items as Tournament[];
    console.log("Getting USERS");
    const data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "USERS" },
        ExpressionAttributeNames: { "#pk": "pk", "#name": "name"},
        ProjectionExpression: "sk, #name, lastSeen"
      }));

    let users: UserLastSeen[] = [];
    if (data.Items)
      users = data.Items?.map(u => ({"id": u.sk, "name": u.name, "lastSeen": u.lastSeen}));
    const now = Date.now();
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    const twoWeeks = oneWeek * 2;
    console.log(`Found ${tournaments.length} tournaments`);
    for (const tournament of tournaments) {
      if (
        !tournament.started && now > tournament.dateCreated + twoWeeks
        && (tournament.datePreviousEnded === 0 || now > tournament.datePreviousEnded + oneWeek )
      ) {
        console.log(`Starting tournament ${tournament.id}`);
        const status = await startTournament(users, tournament);
        if (status === -1) {
          cancelledcount++;
        } else if (status === 0) {
          waitingcount++;
        } else if (status === 1) {
          newcount++;
        }
      }
    }
    count = tournaments.length;
  }
  catch (error) {
    logGetItemError(error);
    console.log(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    return;
  }
  console.log(`Checked ${count} tournaments, started ${newcount} new tournaments, waiting for ${waitingcount} tournaments and cancelled ${cancelledcount} tournaments`);
}

async function getPlayersSlowly(playerIDs: string[]) {
  const players: FullUser[] = [];
  for (const id of playerIDs) {
    try {
      const playerData = await sendCommandWithRetry(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "USER", "sk": id
          },
        })
      );
      players.push(playerData.Item as FullUser);
    } catch (error) {
      logGetItemError(error);
      console.log(`Unable to get player ${id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    }
  }
  return players;
}

function addToGameLists(type: string, game: Game, now: number, keepgame: boolean) {
  const work: Promise<any>[] = [];
  const sk = now + "#" + game.id;
  if (type === "COMPLETEDGAMES" && keepgame) {
    work.push(sendCommandWithRetry(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": type,
          "sk": sk,
          ...game}
      })));
    work.push(sendCommandWithRetry(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: {
          "pk": type + "#" + game.metaGame,
          "sk": sk,
          ...game}
      })));
    game.players.forEach((player: { id: string; }) => {
      work.push(sendCommandWithRetry(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: {
            "pk": type + "#" + player.id,
            "sk": sk,
            ...game}
        })));
      work.push(sendCommandWithRetry(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: {
            "pk": type + "#" + game.metaGame + "#" + player.id,
            "sk": sk,
            ...game}
        })));
    });
  }
  if (type === "CURRENTGAMES") {
    work.push(sendCommandWithRetry(new UpdateCommand({
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
    work.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: eavObj,
      UpdateExpression: update
    })));
  }
  return Promise.all(work);
}

async function startTournament(users: UserLastSeen[], tournament: Tournament) {
  // First, get the players
  let playersData;
  try {
    playersData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + '#1#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
      })
    );
  } catch (error) {
    logGetItemError(error);
    console.log(`Unable to get players for tournament ${tournament.id} from table ${process.env.ABSTRACT_PLAY_TABLE}. Error: ${error}`);
    return;
  }
  const players0 = playersData.Items as TournamentPlayer[];
  const remove: TournamentPlayer[] = [];
  const players = players0.filter((player, i) => {
    // If the player timed out in their last tournament game, and they haven't been seen in 30 days, remove them from the tournament.
    // Unless the tournament is in waiting status, then not seen in 30 days is enough to be removed.
    if (
        users?.find(u => u.id === player.playerid)?.lastSeen! < Date.now() - 1000 * 60 * 60 * 24 * 30
        && (tournament.waiting === true || player.timeout === true)
      ) {
      remove.push(player);
      if (player.timeout === true)
        console.log(`Removing player ${player.playerid} from tournament ${tournament.id} because of timeout`);
      else
        console.log(`Removing player ${player.playerid} from tournament ${tournament.id} because they haven't been seen in 30 days`);
      return false;
    } else
      return true;
  });
  let returnvalue = 0;
  if (players.length == 0) {
    // Cancel tournament. Everyone is gone.
    try {
      console.log(`Deleting tournament ${tournament.id}`);
      await sendCommandWithRetry(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TOURNAMENT",
            "sk": tournament.id
          },
        }));
      const sk = tournament.metaGame + "#" + tournament.variants.sort().join("|");
      await sendCommandWithRetry(
        new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {"pk": "TOURNAMENTSCOUNTER", "sk": sk},
          ExpressionAttributeValues: { ":t": true },
          ExpressionAttributeNames: {"#o": "over"},
          UpdateExpression: "set #o = :t"
        }));
    }
    catch (error) {
      logGetItemError(error);
      console.log(`Unable to delete tournament ${tournament.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
      return;
    }
    /*
    try {
      for (let player of players0) {
        work.push(ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "TOURNAMENTPLAYER",
              "sk": player.sk
            },
          })));
      }
    }
    catch (error) {
      logGetItemError(error);
      console.log(`Unable to delete tournament players from table ${process.env.ABSTRACT_PLAY_TABLE}`);
      return;
    }
    // Send email to players
    await initi18n('en');
    const metaGameName = gameinfo.get(tournament.metaGame)?.name;
    for (let player of playersFull) {
      await changeLanguageForPlayer(player);
      let body = '';
      if (tournament.variants.length === 0)
        body = i18n.t("TournamentCancelBody", { "metaGame": metaGameName, "number": tournament.number });
      else
        body = i18n.t("TournamentCancelBodyVariants", { "metaGame": metaGameName, "number": tournament.number, "variants": tournament.variants.join(", ") });
      if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
        const comm = createSendEmailCommand(player.email, player.name, i18n.t("TournamentCancelSubject", { "metaGame": metaGameName }), body);
        work.push(sesClient.send(comm));
      }
    }
    await Promise.all(work);
    console.log("Tournament cancelled");
    */
    returnvalue = -1;
  } else if (players.length < 4) {
    // Not enough players yet
    if (tournament.waiting !== true) {
      try {
        console.log(`Updating tournament ${tournament.id} to waiting`);
        await sendCommandWithRetry(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "TOURNAMENT", "sk": tournament.id },
          ExpressionAttributeValues: { ":t": true },
          UpdateExpression: "set waiting = :t"
        }));
      }
      catch (error) {
        logGetItemError(error);
        console.log(`Unable to update tournament ${tournament.id} to waiting`);
        return;
      }
    }
    returnvalue = 0;
  } else {
    // enough players, start the tournament!
    const clockStart = 72;
    const clockInc = 36;
    const clockMax = 120;
    // Sort players into divisions by rating
    const playersFull = await getPlayersSlowly(players.map(p => p.playerid));
    for (let i = 0; i < playersFull.length; i++) {
      players[i].rating = playersFull[i]?.ratings?.[tournament.metaGame]?.rating;
      if (players[i].rating === undefined)
        players[i].rating = 0;
      players[i].score = 0;
    }
    players.sort((a, b) => b.rating! - a.rating!);
    const allGamePlayers = players.map(p => {return {id: p.playerid, name: p.playername, time: clockStart * 3600000} as User});
    // Sort playersFull in the same order as players
    const playersFull2: FullUser[] = [];
    for (const player of players)
      playersFull2.push(playersFull.find(p => p.id === player.playerid)!);
    // Create divisions
    const numDivisions = Math.ceil(players.length / 10.0); // at most 10 players per division
    const divisionSizeSmall = Math.floor(players.length / numDivisions);
    const numBigDivisions = players.length - divisionSizeSmall * numDivisions; // big divisions have one more player than small divisions!
    // Sort players into divisions by rating
    players.sort((a, b) => b.rating! - a.rating!);
    let division = 1;
    let count = 0;
    for (const player of players) {
      player.division = division;
      player.sk = tournament.id + "#" + division.toString() + '#' + player.playerid;
      try {
        console.log(`Adding player ${player.playerid} to tournament ${tournament.id} in division ${division}`);
        await sendCommandWithRetry(new PutCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: player
        }));
      }
      catch (error) {
        logGetItemError(error);
        console.log(`Unable to add player ${player.playerid} to tournament ${tournament.id} with division ${division}. Error ${error}`);
        return;
      }
      if (division > 1) {
        try {
          console.log(`Deleting player ${player.playerid} from tournament ${tournament.id} with division 1 (so they can be put in the right division)`);
          await sendCommandWithRetry(new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "TOURNAMENTPLAYER", "sk": tournament.id + "#1#" + player.playerid
            },
          }));
        }
        catch (error) {
          logGetItemError(error);
          console.log(`Unable to delete player ${player.playerid} from tournament ${tournament.id} with division 1. Error ${error}`);
          return;
        }
      }
      count++;
      if ((division > numBigDivisions && count === divisionSizeSmall) || (division <= numBigDivisions && count === divisionSizeSmall + 1)) {
        division++;
        count = 0;
      }
    }
    // Create games
    const now = Date.now();
    let player0 = 0;
    const updatedGameIDs: string[][] = [];
    for (let i = 0; i < players.length; i++) {
      updatedGameIDs.push([]);
      if (playersFull2[i].games === undefined)
        playersFull2[i].games = [];
    }
    const divisions: { [division: number]: {numGames: number, numCompleted: number, processed: boolean} } = {};
    for (let division = 1; division <= numDivisions; division++) {
      divisions[division] = {numGames: 0, numCompleted: 0, processed: false};
      for (let i = 0; i < (division <= numBigDivisions ? divisionSizeSmall + 1 : divisionSizeSmall); i++) {
        for (let j = i + 1; j < (division <= numBigDivisions ? divisionSizeSmall + 1 : divisionSizeSmall); j++) {
          divisions[division].numGames += 1;
          const player1 = player0 + i;
          const player2 = player0 + j;
          const gameId = uuid();
          const gamePlayers: User[] = [];
          if ((i + j) % 2 === 1) {
            gamePlayers.push(allGamePlayers[player1]);
            gamePlayers.push(allGamePlayers[player2]);
          } else {
            gamePlayers.push(allGamePlayers[player2]);
            gamePlayers.push(allGamePlayers[player1]);
          }
          let whoseTurn: string | boolean[] = "0";
          const info = gameinfo.get(tournament.metaGame);
          if (info.flags !== undefined && info.flags.includes('simultaneous')) {
            whoseTurn = gamePlayers.map(() => true);
          }
          const variants = tournament.variants;
          let engine;
          if (info.playercounts.length > 1)
            engine = GameFactory(tournament.metaGame, 2, variants);
          else
            engine = GameFactory(tournament.metaGame, undefined, variants);
          if (!engine)
            throw new Error(`Unknown metaGame ${tournament.metaGame}`);
          const state = engine.serialize();
          try {
            console.log(`Creating game ${gameId} for tournament ${tournament.id} with division ${division}`);
            await sendCommandWithRetry(new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: {
                  "pk": "GAME",
                  "sk": tournament.metaGame + "#0#" + gameId,
                  "id": gameId,
                  "metaGame": tournament.metaGame,
                  "numPlayers": 2,
                  "rated": true,
                  "players": info.flags !== undefined && info.flags.includes('perspective') ?
                    gamePlayers.map((p, ind) => {return (ind === 0 ? p : {...p, settings: {"rotate": 180}})})
                    : gamePlayers,
                  "clockStart": clockStart,
                  "clockInc": clockInc,
                  "clockMax": clockMax,
                  "clockHard": true,
                  "state": state,
                  "toMove": whoseTurn,
                  "lastMoveTime": now,
                  "gameStarted": now,
                  "variants": engine.variants,
                  "tournament": tournament.id,
                  "division": division
                }
              }));
          }
          catch (error) {
            logGetItemError(error);
            console.log(`Unable to create game ${gameId} for tournament ${tournament.id} with division ${division}. Error ${error}`);
            return;
          }
          // this should be all the info we want to show on the "my games" summary page.
          const game = {
            "id": gameId,
            "metaGame": tournament.metaGame,
            "players": gamePlayers,
            "clockHard": true,
            "toMove": whoseTurn,
            "lastMoveTime": now,
            "variants": engine.variants,
          } as Game;
          console.log(`Adding game ${gameId} to game lists`);
          await addToGameLists("CURRENTGAMES", game, now, false);
          const tournamentGame = {
            "pk": "TOURNAMENTGAME",
            "sk": tournament.id + "#" + division.toString() + '#' + gameId,
            "id": gameId,
            "player1": gamePlayers[0].id,
            "player2": gamePlayers[1].id
          };
          console.log(`Adding game ${gameId} to TOURNAMENTGAME list`);
          await sendCommandWithRetry(new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Item: tournamentGame
          }));
          // Update players
          playersFull2[player1].games.push(game);
          updatedGameIDs[player1].push(game.id);
          playersFull2[player2].games.push(game);
          updatedGameIDs[player2].push(game.id);
        }
      }
      player0 += division <= numBigDivisions ? divisionSizeSmall + 1 : divisionSizeSmall;
    }
    for (let i = 0; i < playersFull2.length; i++) {
      console.log(`Updating games for player ${playersFull2[i].id}`);
      await updateUserGames(playersFull2[i].id, playersFull2[i].gamesUpdate, updatedGameIDs[i], playersFull2[i].games);
    }
    const newTournamentid = uuid();
    console.log(`Updating tournament ${tournament.id} to started`);
    await sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENT", "sk": tournament.id },
      ExpressionAttributeValues: { ":dt": now, ":t": true, ":nextid": newTournamentid, ":ds": divisions },
      UpdateExpression: "set started = :t, dateStarted = :dt, nextid = :nextid, divisions = :ds"
    }));
    // open next tournament for sign-up.
    console.log(`Opening next tournament ${newTournamentid} for sign-up. Update TOURNAMENTSCOUNTER for '${tournament.metaGame}#${tournament.variants.sort().join("|")}'`);
    try {
      await sendCommandWithRetry(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "TOURNAMENTSCOUNTER", "sk": tournament.metaGame + "#" + tournament.variants.sort().join("|") },
        ExpressionAttributeValues: { ":inc": 1, ":f": false },
        ExpressionAttributeNames: { "#count": "count", "#over": "over" },
        UpdateExpression: "set #count = #count + :inc, #over = :f"
      }));
    } catch (err) {
      logGetItemError(err);
      console.log(`Unable to update TOURNAMENTSCOUNTER for '${tournament.metaGame}#${tournament.variants.sort().join("|")}'. Error: ${err}`);
      return;
    }
    const data = {
      "pk": "TOURNAMENT",
      "sk": newTournamentid,
      "id": newTournamentid,
      "metaGame": tournament.metaGame,
      "variants": tournament.variants,
      "number": tournament.number + 1,
      "started": false,
      "dateCreated": now,
      "datePreviousEnded": 3000000000000
    };
    console.log(`Creating new tournament ${newTournamentid}`);
    try {
      await sendCommandWithRetry(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: data
      }));
    }
    catch (error) {
      logGetItemError(error);
      console.log(`Unable to insert new tournament ${newTournamentid}. Error: ${error}`);
      return;
    }
    // ... and register all current players for it
    for (const player of players) {
      let once = false;
      if (player.once !== undefined && player.once) {
        once = true;
      }
      if (!once) {
        const sk = `${newTournamentid}#1#${player.playerid}`;
        const playerdata: TournamentPlayer = {
            "pk": "TOURNAMENTPLAYER",
            "sk": sk,
            "playername": player.playername,
            "playerid": player.playerid,
        };
        try {
            console.log(`Adding player ${player.playerid} to new tournament ${newTournamentid}`);
        await sendCommandWithRetry(new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Item: playerdata
            }));
        } catch (err) {
            logGetItemError(err);
            console.log(`Unable to add player ${player.playerid} to tournament ${newTournamentid}`);
            return;
        }
      }
    }
    // Send e-mails to participants
    await initi18n('en');
    const metaGameName = gameinfo.get(tournament.metaGame)?.name;
    for (const player of playersFull2) {
        console.log(`Determining whether to send tournamentStart email to the following player:\n${JSON.stringify(player)}`);
        // eslint-disable-next-line no-prototype-builtins
        if ( (player.settings?.all?.notifications === undefined) || (!player.settings.all.notifications.hasOwnProperty("tournamentStart")) || (player.settings.all.notifications.tournamentStart) ) {
            console.log("Sending email");
            await changeLanguageForPlayer(player);
            let body = '';
            if (tournament.variants.length === 0)
                body = i18n.t("TournamentStartBody", { "metaGame": metaGameName, "number": tournament.number });
            else
                body = i18n.t("TournamentStartBodyVariants", { "metaGame": metaGameName, "number": tournament.number, "variants": tournament.variants.join(", ") });
            if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("TournamentStartSubject", { "metaGame": metaGameName }), body);
                await sesClient.send(comm);
            }
        }
    }
    returnvalue = 1;
  }
  // Delete mia players
  if (remove.length > 0) {
    for (const player of remove) {
      console.log(`Deleting tournament player record for ${player.playerid} from tournament ${tournament.id}`);
      await sendCommandWithRetry(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TOURNAMENTPLAYER", "sk": player.sk
          },
        })
      );
    }
    // Let them know they've been removed
    let playersFull: FullUser[] = [];
    try {
      playersFull = await getPlayersSlowly(remove.map(p => p.playerid));
    } catch (error) {
      logGetItemError(error);
      console.log(`Unable to get removed players for tournament ${tournament.id} from table ${process.env.ABSTRACT_PLAY_TABLE}. Error: ${error}`);
      return;
    }
    await initi18n('en');
    const metaGameName = gameinfo.get(tournament.metaGame)?.name;
    for (const player of playersFull) {
      try {
        await changeLanguageForPlayer(player);
        let body = '';
        if (tournament.variants.length === 0)
          body = i18n.t("TournamentRemoveBody", { "metaGame": metaGameName, "number": tournament.number });
        else
          body = i18n.t("TournamentRemoveBodyVariants", { "metaGame": metaGameName, "number": tournament.number, "variants": tournament.variants.join(", ") });
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
          const comm = createSendEmailCommand(player.email, player.name, i18n.t("TournamentRemoveSubject", { "metaGame": metaGameName }), body);
          await sesClient.send(comm);
        }
      } catch (error) {
        logGetItemError(error);
        console.log(`Failed to send email to player ${player.name}, ${player.email}. Error: ${error}`);
      }
    }
  }
  return returnvalue;
}

// Make sure we "lock" games while updating. We are often updating multiple games at once.
async function updateUserGames(userId: string, gamesUpdate: undefined | number, gameIDsChanged: string[], games: Game[]) {
  if (gameIDsChanged.length === 0) {
    return;
  }
  const gameIDsCloned = gameIDsChanged.slice();
  gameIDsChanged.length = 0;
  if (gamesUpdate === undefined) {
    // Update "old" users. This is a one-time update.
    return sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userId },
      ExpressionAttributeValues: { ":val": 1, ":gs": games },
      UpdateExpression: "set gamesUpdate = :val, games = :gs"
    }));
  } else {
    console.log(`updateUserGames: optimistically updating games for ${userId}`);
    try {
      await sendCommandWithRetry(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": userId },
        ExpressionAttributeValues: { ":val": gamesUpdate, ":inc": 1, ":gs": games },
        ConditionExpression: "gamesUpdate = :val",
        UpdateExpression: "set gamesUpdate = gamesUpdate + :inc, games = :gs"
      }));
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        // games has been modified by another process
        // (I should have put these in their own list in the DB!)
        console.log(`updateUserGames: games has been modified by another process for ${userId}`);
        let count = 0;
        while (count < 3) {
          const userData = await sendCommandWithRetry(
            new GetCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: {
                "pk": "USER",
                "sk": userId
              },
            }));
          const user = userData.Item as FullUser;
          const dbGames = user.games;
          const gamesUpdate = user.gamesUpdate;
          const newgames: Game[] = [];
          for (const game of dbGames) {
            if (gameIDsCloned.includes(game.id)) {
              const newgame = games.find(g => g.id === game.id);
              if (newgame) {
                newgames.push(newgame);
              }
            } else {
              newgames.push(game);
            }
          }
          try {
            console.log(`updateUserGames: Update ${count} of games for user`, userId, newgames);
            await sendCommandWithRetry(new UpdateCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "USER", "sk": userId },
              ExpressionAttributeValues: { ":val": gamesUpdate, ":inc": 1, ":gs": newgames },
              ConditionExpression: "gamesUpdate = :val",
              UpdateExpression: "set gamesUpdate = gamesUpdate + :inc, games = :gs"
            }));
            return;
          } catch (err: any) {
            if (err.name === 'ConditionalCheckFailedException') {
                count++;
            } else {
                throw err;
            }
          }
        }
        new Error(`updateUserGames: Unable to update games for user ${userId} after 3 retries`);
      } else {
        new Error(err);
      }
    }
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
