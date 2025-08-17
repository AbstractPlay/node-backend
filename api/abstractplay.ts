/* eslint-disable @typescript-eslint/ban-ts-comment */
'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, QueryCommandOutput, BatchWriteCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand, SendMessageRequest } from "@aws-sdk/client-sqs";
import { v4 as uuid } from 'uuid';
import { gameinfo, GameFactory, GameBase, GameBaseSimultaneous, type APGamesInformation } from '@abstractplay/gameslib';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import webpush, { RequestOptions } from "web-push";
import { validateToken } from '@sunknudsen/totp';
import i18n from 'i18next';
import en from '../locales/en/apback.json';
import fr from '../locales/fr/apback.json';
import it from '../locales/it/apback.json';

const REGION = "us-east-1";
const sesClient = new SESClient({ region: REGION });
const sqsClient = new SQSClient({ region: REGION });
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
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
};

// Types
type MetaGameCounts = {
  [metaGame: string]: {
    currentgames: number;
    completedgames: number;
    standingchallenges: number;
    ratings?: string[];
    stars?: number;
    tags?: string[];
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
  variants: string[];
  challenger: User;
  challengees?: User[]; // players who were challenged
  players?: User[]; // players that have accepted
  clockStart: number;
  clockInc: number;
  clockMax: number;
  clockHard: boolean;
  rated: boolean;
  noExplore?: boolean;
  comment?: string;
  dateIssued?: number;
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
  challenges_issued?: Set<string>;
  challenges_received?: Set<string>;
  challenges_accepted?: Set<string>;
  challenges_standing?: Set<string>;
  admin: boolean | undefined;
  organizer: boolean|undefined;
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
  bggid?: string;
  about?: string;
}

export type UsersData = {
    id: string;
    name: string;
    country: string;
    lastSeen: number;
    stars: string[];
    bggid?: string;
    about?: string;
};

type MeData = {
    id: string;
    name: string;
    admin: boolean;
    organizer: boolean;
    language: string;
    country: string;
    games: Game[];
    settings: UserSettings;
    stars: string[];
    bggid?: string;
    about?: string;
    tags?: TagList[];
    palettes?: Palette[];
    mayPush: boolean;
    challengesIssued?: FullChallenge[];
    challengesReceived?: FullChallenge[];
    challengesAccepted?: FullChallenge[];
    standingChallenges?: FullChallenge[];
    realStanding?: StandingChallenge[];
}

type Rating = {
  rating: number;
  N: number;
  wins: number;
  draws: number;
}

type Note = {
    pk: string;
    sk: string;
    note: string;
}

type Game = {
  pk?: string,
  sk?: string,
  id : string;
  metaGame: string;
  players: User[];
  lastMoveTime: number;
  clockHard: boolean;
  noExplore?: boolean;
  toMove?: string | boolean[];
  note?: string;
  seen?: number;
  winner?: number[];
  numMoves?: number;
  gameStarted?: number;
  gameEnded?: number;
  lastChat?: number;
  variants?: string[];
  commented?: number; // 0 or missing: no comments or post game variations, 1: has in-game comments, 2: has post game variations, 3: has post game comments. Only used in main COMPLETEDGAMES list.
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
  note?: string;
  toMove: string | boolean[];
  partialMove?: string;
  winner?: number[];
  numMoves?: number;
  rated?: boolean;
  pieInvoked?: boolean;
  variants?: string[];
  published?: string[];
  smevent?: string;
  smeventRound?: number;
  tournament?: string;
  event?: string;
  division?: number;
  noExplore?: boolean;
  commented?: number; // 0 or missing: no comments or post game variations, 1: has in-game comments (note this does NOT get updated for post-game comments/variations)
}

type Playground = {
    pk: "PLAYGROUND";
    sk: string;
    metaGame: string;
    state: string;
}

type Comment = {
  comment: string;
  userId: string;
  moveNumber: number;
  timeStamp: number;
}

type PushCredentials = {
    pk: string;
    sk: string;
    payload: any;
}

type PushOptions = {
    userId: string;
    title: string;
    body: string;
    topic: "yourturn"|"ended"|"started"|"challenges"|"test"|"tournament";
    url?: string; //relative url of target page, if appropriate
}

type Exploration = {
  version?: number;
  id: string;
  move: number;
  comment: string;
  children: Exploration[];
  outcome?: number; // Optional. 0 for player1 win, 1 for player2 win, -1 for undecided.
};

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

type TournamentGame = {
  pk: string;
  sk: string;
  id: string;
  player1: string;
  player2: string;
  winner?: string[];
};

type OrgEvent = {
    pk: "ORGEVENT";
    sk: string;             // <eventid>
    name: string;
    description: string;
    organizer: string;
    dateStart: number;
    dateEnd?: number;
    winner?: string[];
    visible: boolean;
}

type OrgEventGame = {
    pk: "ORGEVENTGAME";
    sk: string;             // <eventid>#<gameid>
    metaGame: string;
    variants?: string[];
    round: number;
    gameid: string;
    player1: string;
    player2: string;
    winner?: string[];
    arbitrated?: boolean;
};

type OrgEventPlayer = {
    pk: "ORGEVENTPLAYER";
    sk: string;             // <eventid>#<playerid>
    playerid: string;
    division?: number;
    seed?: number;
};

type TagList = {
    meta: string;
    tags: string[];
}

type TagRec = {
    pk: "TAG";
    sk: string;
    tags: TagList[];
}

type Palette = {
    name: string;
    colours: string[];
}

type PaletteRec = {
    pk: "PALETTES";
    sk: string;
    palettes: Palette[];
}

// SDG-style standing challenges
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
    noExplore?: boolean
    limit: number;
    sensitivity: "meta"|"variants";
    suspended: boolean;
};

type StandingChallengeRec = {
    pk: "REALSTANDING";
    sk: string; // user's ID
    standing: StandingChallenge[];
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

async function verifyAndCorrectCountWithData(metaGame: string, countType: "currentgames" | "completedgames" | "standingchallenges", actualCount: number, countsData: any) {
    try {
        if (!countsData.Item) {
            console.log(`No METAGAMES COUNTS found, creating initial record for ${metaGame}`);
            await ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "METAGAMES", "sk": "COUNTS" },
                ExpressionAttributeNames: { "#g": metaGame },
                ExpressionAttributeValues: { ":count": actualCount },
                UpdateExpression: `set #g.${countType} = :count`
            }));
            console.log(`Initialized ${countType} for ${metaGame} to ${actualCount}`);
            return;
        }

        const details = countsData.Item as MetaGameCounts;
        
        // Check if the metaGame nested attribute exists at all
        if (!details[metaGame]) {
            console.log(`No nested attribute for ${metaGame} in METAGAMES COUNTS, initializing...`);
            await ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "METAGAMES", "sk": "COUNTS" },
                ExpressionAttributeNames: { "#g": metaGame },
                ExpressionAttributeValues: { ":count": actualCount },
                UpdateExpression: `set #g.${countType} = :count`
            }));
            console.log(`Initialized ${countType} for new game ${metaGame} to ${actualCount}`);
            return;
        }
        
        const storedCount = details[metaGame][countType] || 0;

        if (storedCount !== actualCount) {
            console.log(`Count mismatch for ${metaGame}.${countType}: stored=${storedCount}, actual=${actualCount}. Correcting...`);

            await ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "METAGAMES", "sk": "COUNTS" },
                ExpressionAttributeNames: { "#g": metaGame },
                ExpressionAttributeValues: { ":count": actualCount },
                UpdateExpression: `set #g.${countType} = :count`
            }));

            console.log(`Corrected ${countType} for ${metaGame} from ${storedCount} to ${actualCount}`);
        }
    } catch (error) {
        console.error(`Error verifying/correcting count for ${metaGame}.${countType}:`, error);
        // Don't throw - we don't want to break the main query if count correction fails
    }
}

async function verifyAndCorrectRatingsCountWithData(metaGame: string, actualRatings: any[], countsData: any) {
    try {
        // Extract unique player IDs from actual ratings data as a Set
        const actualPlayerIds = new Set(actualRatings.map(rating => rating.sk));
        const actualCount = actualPlayerIds.size;

        if (!countsData.Item && actualCount > 0) {
            console.log(`No METAGAMES COUNTS found, creating initial ratings record for ${metaGame}`);
            await ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "METAGAMES", "sk": "COUNTS" },
                ExpressionAttributeNames: { "#gr": metaGame + "_ratings" },
                ExpressionAttributeValues: { ":players": actualPlayerIds },
                UpdateExpression: `set #gr = :players`
            }));
            console.log(`Initialized ratings for ${metaGame} with ${actualCount} players`);
            return;
        }

        const details = countsData.Item as any;
        const storedPlayerIds = details[metaGame + "_ratings"] || new Set();
        const storedCount = storedPlayerIds.size;

        if (storedCount !== actualCount || !setsEqual(storedPlayerIds, actualPlayerIds)) {
            console.log(`Ratings mismatch for ${metaGame}: stored=${storedCount} players, actual=${actualCount} players. Updating player list...`);

            await ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "METAGAMES", "sk": "COUNTS" },
                ExpressionAttributeNames: { "#gr": metaGame + "_ratings" },
                ExpressionAttributeValues: { ":players": actualPlayerIds },
                UpdateExpression: `set #gr = :players`
            }));

            console.log(`Updated ratings list for ${metaGame} from ${storedCount} to ${actualCount} players`);
        }
    } catch (error) {
        console.error(`Error verifying/correcting ratings for ${metaGame}:`, error);
        // Don't throw - we don't want to break the main query if count correction fails
    }
}

function setsEqual(a: Set<any>, b: Set<any>): boolean {
    if (a.size !== b.size) return false;
    for (let item of a) {
        if (!b.has(item)) return false;
    }
    return true;
}

module.exports.query = async (event: { queryStringParameters: any; body?: string; httpMethod: string; }) => {
  console.log(event);

  let pars;
  let query;

  // Handle both GET (query parameters) and POST (JSON body) requests
  if (event.httpMethod === 'POST' && event.body) {
    try {
      const bodyData = JSON.parse(event.body);
      query = bodyData.query;
      pars = bodyData.pars || {};
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid JSON in request body"
        }),
        headers
      };
    }
  } else {
    // Existing GET request handling
    pars = event.queryStringParameters;
    query = pars.query;
  }

  console.log(pars);
  switch (query) {
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
    case "get_public_exploration":
      return await getPublicExploration(pars);
    case "bot_move":
      return await botMove(pars);
    case "get_tournaments":
      return await getTournaments();
    case "get_old_tournaments":
      return await getOldTournaments(pars);
    case "get_tournament":
      return await getTournament(pars);
    case "start_tournaments":
      return await startTournaments();
    case "archive_tournaments":
      return await archiveTournaments();
    case "get_event":
      return await eventGetEvent(pars);
    case "get_events":
      return await eventGetEvents();
    case "report_problem":
      return await reportProblem(pars);
    default:
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: `Unable to execute unknown open query '${pars.query}'`
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
    case "next_game":
      return await nextGame(event.cognitoPoolClaims.sub);
    case "my_settings":
      return await mySettings(event.cognitoPoolClaims);
    case "new_setting":
      return await newSetting(event.cognitoPoolClaims.sub, pars);
    case "new_profile":
      return await newProfile(event.cognitoPoolClaims, pars);
    case "set_push":
      return await setPush(event.cognitoPoolClaims.sub, pars);
    case "save_push":
      return await savePush(event.cognitoPoolClaims.sub, pars);
    case "save_tags":
      return await saveTags(event.cognitoPoolClaims.sub, pars);
    case "save_palettes":
      return await savePalettes(event.cognitoPoolClaims.sub, pars);
    case "update_standing":
      return await updateStanding(event.cognitoPoolClaims.sub, pars);
    case "new_challenge":
      return await newChallenge(event.cognitoPoolClaims.sub, pars);
    case "challenge_revoke":
      return await revokeChallenge(event.cognitoPoolClaims.sub, pars);
    case "challenge_response":
      return await respondedChallenge(event.cognitoPoolClaims.sub, pars);
    case "submit_move":
      return await submitMove(event.cognitoPoolClaims.sub, pars);
    case "timeloss":
      return await checkForTimeloss(event.cognitoPoolClaims.sub, pars);
    case "abandoned":
      return await checkForAbandonedGame(event.cognitoPoolClaims.sub, pars);
    case "invoke_pie":
      return await invokePie(event.cognitoPoolClaims.sub, pars);
    case "update_note":
      return await updateNote(event.cognitoPoolClaims.sub, pars);
    case "update_commented":
      return await updateCommented(event.cognitoPoolClaims.sub, pars);
    case "set_lastSeen":
      return await setLastSeen(event.cognitoPoolClaims.sub, pars);
    case "submit_comment":
      return await submitComment(event.cognitoPoolClaims.sub, pars);
    case "save_exploration":
      return await saveExploration(event.cognitoPoolClaims.sub, pars);
    case "get_exploration":
      return await getExploration(event.cognitoPoolClaims.sub, pars);
    case "get_private_exploration":
      return await getPrivateExploration(event.cognitoPoolClaims.sub, pars);
    case "get_game":
      return await game(event.cognitoPoolClaims.sub, pars);
    case "get_playground":
      return await getPlayground(event.cognitoPoolClaims.sub, pars);
    case "new_playground":
      return await newPlayground(event.cognitoPoolClaims.sub, pars);
    case "reset_playground":
      return await resetPlayground(event.cognitoPoolClaims.sub);
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
    case "mark_published":
      return await markAsPublished(event.cognitoPoolClaims.sub, pars);
    case "new_tournament":
      return await newTournament(event.cognitoPoolClaims.sub, pars);
    case "join_tournament":
      return await joinTournament(event.cognitoPoolClaims.sub, pars);
    case "withdraw_tournament":
      return await withdrawTournament(event.cognitoPoolClaims.sub, pars);
    case "event_create":
      return await eventCreate(event.cognitoPoolClaims.sub, pars);
    case "event_delete":
      return await eventDelete(event.cognitoPoolClaims.sub, pars);
    case "event_publish":
        return await eventPublish(event.cognitoPoolClaims.sub, pars);
    case "event_register":
        return await eventRegister(event.cognitoPoolClaims.sub, pars);
    case "event_withdraw":
        return await eventWithdraw(event.cognitoPoolClaims.sub, pars);
    case "event_update_start":
      return await eventUpdateStart(event.cognitoPoolClaims.sub, pars);
    case "event_update_name":
      return await eventUpdateName(event.cognitoPoolClaims.sub, pars);
    case "event_update_desc":
      return await eventUpdateDesc(event.cognitoPoolClaims.sub, pars);
    case "event_update_result":
      return await eventUpdateResult(event.cognitoPoolClaims.sub, pars);
    case "event_update_divisions":
      return await eventUpdateDivisions(event.cognitoPoolClaims.sub, pars);
    case "event_create_games":
      return await eventCreateGames(event.cognitoPoolClaims.sub, pars);
    case "event_close":
      return await eventClose(event.cognitoPoolClaims.sub, pars);
    case "ping_bot":
      return await pingBot(event.cognitoPoolClaims.sub, pars);
    case "onetime_fix":
      return await onetimeFix(event.cognitoPoolClaims.sub);
    case "test_push":
      return await testPush(event.cognitoPoolClaims.sub);
    case "test_async":
      return await testAsync(event.cognitoPoolClaims.sub, pars);
    case "delete_games":
      return await deleteGames(event.cognitoPoolClaims.sub, pars);
    case "end_tournament":
      return await endATournament(event.cognitoPoolClaims.sub, pars);
    case "start_tournament":
        return await startATournament(event.cognitoPoolClaims.sub, pars);
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
        ProjectionExpression: "sk, #name, lastSeen, country, stars, bggid, about",
        ReturnConsumedCapacity: "INDEXES"
      }));

    const users = data.Items;
    if (users == undefined) {
      throw new Error("Found no users?");
    }

    // tweak bot info
    const idx = users.findIndex(u => u.sk === process.env.AIAI_USERID);
    if (idx !== -1) {
        users[idx].lastSeen = Date.now();
    }

    return {
      statusCode: 200,
      body: JSON.stringify(users.map(u => ({id: u.sk, name: u.name, country: u.country, stars: u.stars, lastSeen: u.lastSeen, bggid: u.bggid, about: u.about} as UsersData))),
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

  // Start fetching counts in parallel
  const countsPromise = ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "METAGAMES", "sk": "COUNTS"
      },
    })
  );

  if (pars.type === "current") {
    try {
      const [gamesData, countsData] = await Promise.all([
        ddbDocClient.send(
          new QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            ExpressionAttributeValues: { ":pk": "GAME", ":sk": game + '#0#' },
            ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          })),
        countsPromise
      ]);

      const gamelist = gamesData.Items as FullGame[];

      // Verify and correct current games count
      const actualCount = gamelist.length;
      await verifyAndCorrectCountWithData(game, "currentgames", actualCount, countsData);

      const returnlist = gamelist.map(g => {
        const state = GameFactory(g.metaGame, g.state); // JSON.parse(g.state);
        if (state === undefined) {
            throw new Error(`Could not parse game state for ${g.metaGame}:\n${g.state}`);
        }
        return { "id": g.id, "metaGame": g.metaGame, "players": g.players, "toMove": g.toMove, "gameStarted": g.gameStarted,
          "numMoves": state.stack.length - 1, "variants": state.variants } });
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
      const [gamesData, countsData] = await Promise.all([
        ddbDocClient.send(
          new QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "COMPLETEDGAMES#" + game },
            ExpressionAttributeNames: { "#pk": "pk" }
          })),
        countsPromise
      ]);

      // Verify and correct completed games count
      const actualCount = gamesData.Items?.length || 0;
      await verifyAndCorrectCountWithData(game, "completedgames", actualCount, countsData);

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

  // Start fetching counts in parallel
  const countsPromise = ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "METAGAMES", "sk": "COUNTS"
      },
    })
  );

  try {
    const [ratingsData, countsData] = await Promise.all([
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "RATINGS#" + game },
          ExpressionAttributeNames: { "#pk": "pk" }
        })),
      countsPromise
    ]);

    // Verify and correct ratings count
    const actualRatings = ratingsData.Items || [];
    await verifyAndCorrectRatingsCountWithData(game, actualRatings, countsData);

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

  // Start fetching counts in parallel
  const countsPromise = ddbDocClient.send(
    new GetCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "METAGAMES", "sk": "COUNTS"
      },
    })
  );

  try {
    const [challengesData, countsData] = await Promise.all([
      ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeValues: { ":pk": "STANDINGCHALLENGE#" + game },
          ExpressionAttributeNames: { "#pk": "pk" }
        })),
      countsPromise
    ]);

    // Verify and correct standing challenges count
    const actualCount = challengesData.Items?.length || 0;
    await verifyAndCorrectCountWithData(game, "standingchallenges", actualCount, countsData);

    return {
      statusCode: 200,
      body: JSON.stringify(challengesData.Items),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get standing challenges for ${pars.metaGame}`);
  }
}

async function assembleTags(): Promise<TagList[]|undefined> {
    try {
        const data = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "TAG" },
                ExpressionAttributeNames: { "#pk": "pk" },
        }));
        const allTags = data.Items as TagRec[];
        const collated = new Map<string, string[]>();
        if (allTags !== undefined) {
            for (const rec of allTags) {
                for (const {meta, tags} of rec.tags) {
                    const uniques = new Set<string>(tags);
                    if (collated.has(meta)) {
                        for (const tag of collated.get(meta)!) {
                            uniques.add(tag);
                        }
                    }
                    collated.set(meta, [...uniques.values()].sort((a,b) => a.localeCompare(b)));
                }
            }
        }
        return [...collated.entries()].map(([meta, tags]) => {return {meta, tags}});
    } catch (error) {
        return undefined;
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
    // console.log(`Got the following metagame counts:\n${JSON.stringify(details, undefined, 2)}`);
    // get list of tags
    const taglist = await assembleTags();
    if (taglist === undefined) {
        throw new Error("An error occured while fetching game tags");
    }
    for (const key of Object.keys(details)) {
        if ( (key === "pk") || (key === "sk") || key.endsWith("_ratings") ) {
            continue;
        }
        const tags = taglist.find(l => l.meta === key);
        if (tags !== undefined) {
            details[key].tags = [...tags.tags]
        } else {
            details[key].tags = [];
        }
    }
    // console.log(`Details:\n${JSON.stringify(details, undefined, 2)}`);
    // Change every "ratings" to the number of elements in the Set.
    const details2 = Object.keys(details)
      .filter(key => key !== "pk" && key !== "sk" && !key.endsWith("_ratings"))
      .reduce( (a, k) => ({
        ...a,
        [k]: {
          ...details[k],
          "ratings": (details as any)[k + "_ratings"]?.size ?? 0
        }
      }), {})
    // console.log(`Details2:\n${JSON.stringify(details2, undefined, 2)}`);
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

async function game(userid: string, pars: { id: string, cbit: string | number, metaGame: string, retryAttempt?: number }) {
  try {
    if (pars.retryAttempt && pars.retryAttempt > 0) {
      console.log(`get_game called with retry attempt ${pars.retryAttempt} for game ${pars.id}, metaGame ${pars.metaGame}`);
    }
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
    const getNote = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "NOTE",
          "sk": `${pars.id}#${userid}`,
        },
        ReturnConsumedCapacity: "INDEXES"
      }));

    const gameData = await getGame;
    // console.log(`Game data fetched:\n${JSON.stringify(gameData)}`);
    let game = gameData.Item as FullGame;
    if (game === undefined) {
      // Maybe the game has ended and we need to look for the completed game.
      if (pars.cbit === 0 || pars.cbit === "0") {
        const completedGameData = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "GAME",
              "sk": pars.metaGame + "#1#" + pars.id
            },
          }));
        game = completedGameData.Item as FullGame;
      }
      if (game === undefined) {
        throw new Error(`Game ${pars.id}, metaGame ${pars.metaGame}, completed bit ${pars.cbit} not found`);
      }
    }
    // Always set seen time, not just when the game is over
    if (userid !== undefined && userid !== null && userid !== "") {
        await setSeenTime(userid, pars.id);
    }
    // hide other player's simultaneous moves
    const flags = gameinfo.get(game.metaGame).flags;
    if (flags !== undefined && flags.includes('simultaneous') && game.partialMove !== undefined) {
      game.partialMove = game.partialMove.split(',').map((m: string, i: number) => (game.players[i].id === userid ? m : '')).join(',');
    }
    const noteData = await getNote;
    console.log(`Fetched notes:\n${JSON.stringify(noteData)}`);
    if (noteData.Item !== undefined && noteData.Item.note) {
        game.note = noteData.Item.note;
    }
    let comments = [];
    const commentData = await getComments;
    // console.log(`Fetched comments:\n${JSON.stringify(commentData)}`);
    if (commentData.Item !== undefined && commentData.Item.comments)
      comments = commentData.Item.comments;

    // TODO: Rehydrate state, run it through the stripper if game is not over, and then replace with the new, stripped state
    if (game.gameEnded === undefined) {
        const engine = GameFactory(game.metaGame, game.state);
        if (engine === undefined) {
            throw new Error(`Could not rehydrate the state for id "${pars.id}", cbit "${pars.cbit}", meta "${pars.metaGame}".`);
        }
        if (!engine.gameover) {
            let player: number|undefined;
            const pidx = game.players.findIndex(p => p.id === userid);
            if (pidx >= 0) {
                player = pidx + 1;
            }
            game.state = engine.serialize({strip: true, player});
        }
    }

    console.log(`Returning 200.`);
    return {
      statusCode: 200,
      body: JSON.stringify({"game": game, "comments": comments}),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get ${pars.metaGame} game ${pars.id}, completed bit ${pars.cbit} from DB`);
  }
}

async function newPlayground(userid: string, pars: { metaGame: string; state: string; }) {
    console.log(`New playground request received:\nGame: ${pars.metaGame}\nState: ${pars.state}`);
    // first make sure it's a 2-player non-simultaneous game
    const info: APGamesInformation|undefined = gameinfo.get(pars.metaGame);
    let valid = true;
    if (info !== undefined) {
        if ( (! info.playercounts.includes(2)) || (info.flags.includes("simultaneous")) ) {
            valid = false;
        }
    } else {
        valid = false;
    }

    if (! valid) {
        console.log(`Invalid game (400)`);
        return {
            statusCode: 400,
            headers
        };
    }

    // initialize the playground
    try {
        // delete existing exploration
        console.log(`Deleting existing exploration`);
        const explorationQuery = ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "GAMEEXPLORATION#" + userid },
                ExpressionAttributeNames: { "#pk": "pk" },
        }));
        const explorationData = await explorationQuery;
        const explorationRecs = explorationData.Items;
        if (explorationRecs !== undefined) {
            const batches = Math.ceil(explorationRecs.length / 10);
            for (let batch = 0; batch < batches; batch++) {
                const subset = explorationRecs.slice(batch * 10, 10);
                await ddbDocClient.send(
                    new BatchWriteCommand({
                        "RequestItems": {
                            [process.env.ABSTRACT_PLAY_TABLE!]: subset.map(item => ({
                                DeleteRequest: {
                                    Key: {
                                        pk: item.pk,
                                        sk: item.sk,
                                    }
                                }
                            }))
                        }
                    })
                );
            }
        }

        // create new playground record
        console.log(`Creating playground record`);
        const Item: Playground = {
            pk: "PLAYGROUND",
            sk: userid,
            metaGame: pars.metaGame,
            state: pars.state,
        };
        await ddbDocClient.send(
            new PutCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item,
            })
        );
        console.log(`Returning ${JSON.stringify(Item)}`);
        return {
            statusCode: 200,
            body: JSON.stringify(Item),
            headers
        };
    }
    catch (error) {
        handleCommonErrors(error as {code: any; message: any});
        return formatReturnError(`Unable to create playground for ${userid}: ${error}`);
    }
}

async function resetPlayground(userid: string) {
    console.log(`Playground reset requested`);
    try {
        // delete existing exploration
        console.log(`Deleting existing exploration`);
        const explorationQuery = ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "GAMEEXPLORATION#" + userid },
                ExpressionAttributeNames: { "#pk": "pk" },
        }));
        const explorationData = await explorationQuery;
        const explorationRecs = explorationData.Items;
        if (explorationRecs !== undefined) {
            const batches = Math.ceil(explorationRecs.length / 10);
            for (let batch = 0; batch < batches; batch++) {
                const subset = explorationRecs.slice(batch * 10, 10);
                await ddbDocClient.send(
                    new BatchWriteCommand({
                        "RequestItems": {
                            [process.env.ABSTRACT_PLAY_TABLE!]: subset.map(item => ({
                                DeleteRequest: {
                                    Key: {
                                        pk: item.pk,
                                        sk: item.sk,
                                    }
                                }
                            }))
                        }
                    })
                );
            }
        }

        // delete existing playground record
        await ddbDocClient.send(
            new DeleteCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: {
                "pk": "PLAYGROUND", "sk": userid
              },
            })
        )
        console.log(`Playground reset`);
        return {
            statusCode: 200,
            headers
        };
    }
    catch (error) {
        handleCommonErrors(error as {code: any; message: any});
        return formatReturnError(`Unable to reset playground for ${userid}: ${error}`);
    }
}

async function getPlayground(userid: string, pars: any) {
    try {
      const getGame = ddbDocClient.send(
         new GetCommand({
           TableName: process.env.ABSTRACT_PLAY_TABLE,
           Key: {
             "pk": "PLAYGROUND",
             "sk": userid
           },
         }));

      const gameData = await getGame;
      const game = gameData.Item as Playground;
      if (game === undefined) {
        return {
             statusCode: 200,
             body: JSON.stringify(null),
             headers
           };
      }  else {
         return {
            headers,
            statusCode: 200,
            body: JSON.stringify(game),
          };
      }
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to get playground for user ${userid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
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
        list.push(
            ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "USERS", "sk": player.id },
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
                ExpressionAttributeNames: { "#g": pars.metaGame },
                ExpressionAttributeValues: {":n": delta, ":zero": 0},
                UpdateExpression: "set #g.stars = if_not_exists(#g.stars, :zero) + :n",
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

// NOTE: This function will blow up hidden-information games
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
  if (games !== undefined) {
    const thegame = games.find((g: { id: any; }) => g.id == gameid);
    if (thegame !== undefined) {
      thegame.seen = Date.now();
    }
  }
  return updateUserGames(userid, user.gamesUpdate, [gameid], games);
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

async function me(claim: PartialClaims, pars: { size: string, vars: string, update: string }) {
  const userId = claim.sub;
  const email = claim.email;
  if (!claim.email || claim.email.trim().length === 0) {
    console.log(`How!?: claim.email is ${claim.email}`);
  }
  if (!pars || !pars.size || pars.size !== "small")
    console.log(`ME: Attempting to find data for user id ${userId}, vars ${pars?.vars}, update ${pars?.update}`);
  else
    console.log(`ME (small): Attempting to find data for user id ${userId}, vars ${pars.vars}, update ${pars.update}`);

  const fixGames = false;
  try {
    console.log(`Getting USER record`);
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

    // fetch tags
    const tagWork = ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "TAG",
            "sk": userId
            },
        })
    );

    // fetch palettes
    const paletteWork = ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "PALETTES",
            "sk": userId
            },
        })
    );

    // fetch "real" standing challenges
    const standingWork = ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "REALSTANDING",
            "sk": userId
            },
        })
    );

    const removedGameIDs: string[] = [];
    if (!pars || !pars.size || pars.size !== "small") {
      // LogInOutButton calls "me" with "small". If we do the below from the dashboard (and then at the same time from LogInOutButton) we run into
      // all kinds of race conditions. So we only do the below if we are not in "small" mode.

      // Check for "recently completed games"
      console.log(`Checking for recently completed games`);
      // As soon as a game is over move it to archive status (game.type = 0).
      // Remove the game from user's games list one week after they have seen it. "Seen it" means they clicked on the game (or they were the one that caused the end of the game).
      for (let i = games.length - 1; i >= 0; i-- ) {
        const game = games[i];
        if (game.toMove === "" || game.toMove === null ) {
          if ( (game.seen !== undefined) && (Date.now() - (game.seen || 0) > 7 * 24 * 3600000) && ((game.lastChat || 0) <= (game.seen || 0)) ) {
            games.splice(i, 1);
            removedGameIDs.push(game.id);
          }
        }
      }
      // Check for out-of-time games

      console.log(`Checking for out-of-time games`);
      for(const game of games) {
        if (game.clockHard && game.toMove && game.toMove !== '') {
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
              await updateUserGames(userId, user.gamesUpdate, removedGameIDs, games);
              game.toMove = '';
              game.lastMoveTime = game.lastMoveTime + game.players[minIndex].time!;
              await timeloss(false, minIndex, game.id, game.metaGame, game.lastMoveTime);
            }
          } else {
            const toMove = parseInt(game.toMove);
            if (game.players[toMove].time! - (Date.now() - game.lastMoveTime) < 0) {
              // To make sure games are up to date before we update further. Note this is a noop if removedGameIDs === [].
              await updateUserGames(userId, user.gamesUpdate, removedGameIDs, games);
              game.lastMoveTime = game.lastMoveTime + game.players[toMove].time!;
              game.toMove = '';
              // DON'T parallelize this!
              await timeloss(false, toMove, game.id, game.metaGame, game.lastMoveTime);
            }
          }
        }
      }
    }
    // Update last seen date for user
    console.log(`Updating last seen date for USER and USERS`);
    const lastSeenUserWork = ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userId },
      ExpressionAttributeValues: { ":dt": Date.now() },
      UpdateExpression: "set lastSeen = :dt"
    }));
    const lastSeenUsersWork = ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USERS", "sk": userId },
        ExpressionAttributeValues: { ":dt": Date.now() },
        UpdateExpression: "set lastSeen = :dt"
    }));

    let data = null;
    console.log(`Fetching challenges`);
    let tagData, paletteData, standingData;
    if (!pars || !pars.size || pars.size !== "small") {
      const challengesIssuedIDs: string[] = Array.from(user?.challenges_issued ?? new Set());
      const challengesReceivedIDs: string[] = Array.from(user?.challenges_received ?? new Set());
      const challengesAcceptedIDs: string[] = Array.from(user?.challenges_accepted ?? new Set());
      const standingChallengeIDs: string[] = Array.from(user?.challenges_standing ?? new Set());
      const challengesIssued = getChallenges(challengesIssuedIDs);
      const challengesReceived = getChallenges(challengesReceivedIDs);
      const challengesAccepted = getChallenges(challengesAcceptedIDs);
      const standingChallenges = getChallenges(standingChallengeIDs);
      data = await Promise.all([challengesIssued, challengesReceived, challengesAccepted, standingChallenges, tagWork, paletteWork, lastSeenUserWork, lastSeenUsersWork,
        updateUserGames(userId, user.gamesUpdate, removedGameIDs, games), standingWork]);
      tagData = data[4];
      paletteData = data[5];
      standingData = data[9];
    } else {
      data = await Promise.all([tagWork, paletteWork, lastSeenUserWork, lastSeenUsersWork,
        updateUserGames(userId, user.gamesUpdate, removedGameIDs, games), standingWork]);
      tagData = data[0];
      paletteData = data[1];
      standingData = data[5];
    }
    let tags: TagList[] = [];
    if (tagData.Item !== undefined) {
        const tagRec = tagData.Item as TagRec;
        tags = tagRec.tags;
    }
    let palettes: Palette[] = [];
    if (paletteData.Item !== undefined) {
        const paletteRec = paletteData.Item as PaletteRec;
        palettes = paletteRec.palettes;
    }
    let realStanding: StandingChallenge[] = [];
    if (standingData.Item !== undefined) {
        const standingRec = standingData.Item as StandingChallengeRec;
        realStanding = standingRec.standing;
    }

    if (data && (!pars || !pars.size || pars.size !== "small")) {
      // Still trying to get to the bottom of games shown as "to move" when already moved.
      console.log(`me returning for ${user.name}, id ${user.id} with games`, games);
      return {
        statusCode: 200,
        body: JSON.stringify({
          "id": user.id,
          "name": user.name,
          "admin": (user.admin === true),
          "organizer": (user.organizer === true),
          "language": user.language,
          "country": user.country,
          "games": games,
          "settings": user.settings,
          "stars": user.stars,
          "bggid": user.bggid,
          "about": user.about,
          tags,
          palettes,
          "mayPush": user.mayPush,
          "challengesIssued": (data[0] as any[]).map(d => d.Item),
          "challengesReceived": (data[1] as any[]).map(d => d.Item),
          "challengesAccepted": (data[2] as any[]).map(d => d.Item),
          "standingChallenges": (data[3] as any[]).map(d => d.Item),
          "realStanding": realStanding,
        } as MeData, Set_toJSON),
        headers
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({
          "id": user.id,
          "name": user.name,
          "admin": (user.admin === true),
          "organizer": (user.organizer === true),
          "language": user.language,
          "country": user.country,
          "games": games,
          "settings": user.settings,
          "stars": user.stars,
          "bggid": user.bggid,
          "about": user.about,
          tags,
          palettes,
          "realStanding": realStanding,
        } as MeData, Set_toJSON),
        headers
      }
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to get user data for ${userId}`);
  }
}

async function nextGame(userid: string) {
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

      // get list of all games where it is your turn
      type GameWithTime = {
        game: Game;
        remaining: number;
      };
      const yourturn: GameWithTime[] = [];
      for (const game of userRec.games) {
        const thisPlayerIdx = game.players.findIndex(p => p.id === userid);
        // explicitly this player's turn
        if ((Array.isArray(game.toMove) && game.toMove.length > thisPlayerIdx + 1 && game.toMove[thisPlayerIdx]) || (game.toMove === thisPlayerIdx.toString())) {
            const remaining = (game.players[thisPlayerIdx].time || 0) - (Date.now() - game.lastMoveTime);
            yourturn.push({game, remaining});
        }
      }
      // sort by time remaining
      yourturn.sort((a,b) => a.remaining - b.remaining);
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

// Make sure we "lock" games while updating. We are often updating multiple games at once.
async function updateUserGames(userId: string, gamesUpdate: undefined | number, gameIDsChanged: string[], games: Game[] = []) {
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
          const userData = await ddbDocClient.send(
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
          } catch (innerErr: any) {
            if (innerErr.name === 'ConditionalCheckFailedException') {
                count++;
            } else {
                throw innerErr;
            }
          }
        }
        throw new Error(`updateUserGames: Unable to update games for user ${userId} after 3 retries`);
      } else {
        throw err;
      }
    }
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
    case "country":
      attr = "country";
      val = pars.value;
      break;
    case "bggid":
      attr = "bggid";
      val = pars.value;
      break;
    case "about":
      attr = "about";
      val = pars.value.substring(0, 255);
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
        ProjectionExpression: "id, players, metaGame, clockHard, toMove, lastMoveTime, noExplore",
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
          ProjectionExpression: "id, players, metaGame, clockHard, toMove, lastMoveTime, noExplore",
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
  fullGames.forEach((game: { players: any[]; id: any; metaGame: any; clockHard: any; toMove: any; lastMoveTime: any; noExplore?: any; }) => {
    if (game.players.some((p: { id: any; }) => p.id === userid)) {
      games.push({"id": game.id, "metaGame": game.metaGame, "players": game.players, "clockHard": game.clockHard, "toMove": game.toMove, "lastMoveTime": game.lastMoveTime, "noExplore": game.noExplore || false});
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

async function setPush(userid: string, pars: { state: boolean }) {
    try {
        console.log(`Setting 'mayPush' to ${pars.state} for user ${userid}`);
        await ddbDocClient.send(
            new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {"pk": "USER", "sk": userid},
                ExpressionAttributeNames: {"#mp": "mayPush"},
                ExpressionAttributeValues: {":mp": pars.state},
                UpdateExpression: "set #mp = :mp"
            })
        );
        if (pars.state === false) {
            // purge any existing push data for this user
            await ddbDocClient.send(
                new DeleteCommand({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "PUSH", "sk": userid
                  },
                })
            )
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

async function savePush(userid: string, pars: { payload: any }) {
    try {
        console.log(`Attempting to save push notification credentials for user ${userid}:\n${JSON.stringify(pars.payload)}`);
        await ddbDocClient.send(new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "PUSH",
                "sk": userid,
                "payload": pars.payload,
              }
        }));
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

async function saveTags(userid: string, pars: { payload: TagList[] }) {
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

async function savePalettes(userid: string, pars: { palettes: Palette[] }) {
    try {
        console.log(`Attempting to save palettes for user ${userid}:\n${JSON.stringify(pars.palettes)}`);
        if (pars.palettes.length === 0) {
            await ddbDocClient.send(
                new DeleteCommand({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "PALETTES", "sk": userid
                  },
                })
            )
        } else {
            await ddbDocClient.send(new PutCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Item: {
                    "pk": "PALETTES",
                    "sk": userid,
                    "palettes": pars.palettes,
                  } as PaletteRec
            }));
        }
    } catch (error) {
        logGetItemError(error);
        throw new Error("saveTags: Failed to save palettes");
    }
    return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Successfully saved palettes for ${userid}`,
        }),
        headers
    };
}

async function updateStanding(userid: string, pars: {entries: StandingChallenge[]}) {
    try {
        // simply replace the existing record
        const Item: StandingChallengeRec = {
            pk: "REALSTANDING",
            sk: userid,
            standing: pars.entries,
        };
        await ddbDocClient.send(
            new PutCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item,
            })
        );
        console.log(`Returning ${JSON.stringify(Item)}`);
        return {
            statusCode: 200,
            body: JSON.stringify(Item),
            headers
        };
    }
    catch (error) {
        handleCommonErrors(error as {code: any; message: any});
        return formatReturnError(`Unable to update standing challenges for ${userid}: ${error}`);
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
        "rated": challenge.rated,
        "noExplore": challenge.noExplore || false,
        "comment": challenge.comment || "",
        "dateIssued": Date.now(),
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": new Set([challengeId]) },
    ExpressionAttributeNames: { "#ci": "challenges_issued" },
    UpdateExpression: "add #ci :c",
  }));

  const list: Promise<any>[] = [addChallenge, updateChallenger];
  if (challenge.challengees !== undefined) {
    challenge.challengees.forEach((challengee: { id: string; }) => {
      list.push(
        ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "USER", "sk": challengee.id },
          ExpressionAttributeValues: { ":c": new Set([challengeId]) },
          ExpressionAttributeNames: { "#cr": "challenges_received" },
          UpdateExpression: "add #cr :c",
        }))
      );
    })
    try {
      list.push(sendChallengedEmail(challenge.challenger.name, challenge.challengees, challenge.metaGame, challenge.comment));
    } catch (error) {
      logGetItemError(error);
      throw new Error("newChallenge: Failed to send emails");
    }
  }
  try {
    await Promise.all(list);
    console.log("Successfully added challenge" + challengeId);

    // If the bot is challenged, trigger its challenge mgmt code here
    if (challenge.challengees !== undefined) {
        const idx = challenge.challengees.findIndex(u => u.id === process.env.AIAI_USERID);
        if (idx !== -1) {
            console.log("Triggering bot management code");
            await botManageChallenges();
        }
    }

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
        "rated": challenge.rated,
        "noExplore": challenge.noExplore || false,
        "comment": challenge.comment || "",
        "dateIssued": Date.now(),
      }
    }));

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": userid },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#cs": "challenges_standing" },
    UpdateExpression: "add #cs :c",
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

async function sendChallengedEmail(challengerName: string, opponents: User[], metaGame: string, comment: string | undefined) {
  const players: FullUser[] = await getPlayers(opponents.map((o: { id: any; }) => o.id));
  metaGame = gameinfo.get(metaGame).name;
  await initi18n('en');
  const work: Promise<any>[] = [];
  comment = comment ? comment.trim() : "";
  if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
    comment += ".";
  for (const player of players) {
    if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
        await changeLanguageForPlayer(player);
        let body;
        if (comment === ".") {
          body = i18n.t("ChallengeBody", { "challenger": challengerName, metaGame });
        } else {
          body = i18n.t("ChallengeBodyComment", { "challenger": challengerName, metaGame, comment });
        }
        if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
          const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeSubject"), body);
          work.push(sesClient.send(comm));
        } else {
            console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
          userId: player.id,
          topic: "challenges",
          title: i18n.t("PUSH.titles.challenged"),
          body: body,
          url: "/",
        }));
    } else {
      console.log(`No verified email address found for ${player.name} (${player.id})`);
    }
  }
  return Promise.all(work);
}

async function revokeChallenge(userid: any, pars: { id: string; metaGame: string; standing: boolean; comment:string; }) {
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
    let comment = pars.comment ? pars.comment.trim() : "";
    if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
      comment += ".";
    const metaGame = gameinfo.get(challenge.metaGame).name;
    await initi18n('en');
    // Inform challenged
    if (challenge.challengees) {
      const players: FullUser[] = await getPlayers(challenge.challengees.map((c: { id: any; }) => c.id));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        let body;
        if (comment === ".") {
          body = i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame});
        } else {
          body = i18n.t("ChallengeRevokedBodyComment", { name: challenge.challenger.name, metaGame, comment});
        }
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), body);
                work.push(sesClient.send(comm));
            } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
            userId: player.id,
            topic: "challenges",
            title: i18n.t("PUSH.titles.revoked"),
            body: body,
            url: "/",
        }));
      }
    }
    // Inform players that have already accepted
    if (challenge.players) {
      const players = await getPlayers(challenge.players.map((c: { id: any; }) => c.id).filter((id: any) => id !== challenge!.challenger.id));
      for (const player of players) {
        await changeLanguageForPlayer(player);
        let body;
        if (comment === ".") {
          body = i18n.t("ChallengeRevokedBody", { name: challenge.challenger.name, metaGame});
        } else {
          body = i18n.t("ChallengeRevokedBodyComment", { name: challenge.challenger.name, metaGame, comment});
        }
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRevokedSubject"), body);
                work.push(sesClient.send(comm));
                    } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
            userId: player.id,
            topic: "challenges",
            title: i18n.t("PUSH.titles.revoked"),
            body: body,
            url: "/",
        }));
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

async function respondedChallenge(userid: string, pars: { response: boolean; id: string; standing?: boolean; metaGame: string; comment: string;}) {
  const response = pars.response;
  const challengeId = pars.id;
  const standing = pars.standing === true;
  const metaGame = pars.metaGame;
  let comment = pars.comment ? pars.comment.trim() : "";
  if (!comment.endsWith(".") && !comment.endsWith("!") && !comment.endsWith("?"))
    comment += ".";
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
            let body = i18n.t("GameStartedBody", { metaGame: email.metaGame });
            if (ind === 0 || email.simultaneous) {
              body += " " + i18n.t("YourMove");
            }
            if (comment !== "." && player.id !== userid) {
              body += " " + i18n.t("ChallengeResponseComment", { comment });
            }
            if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
                if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.gameStart) ) {
                    const ebody = body + " " + i18n.t("GameLink", { metaGame: metaGame, gameId: email.gameId});
                    const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameStartedSubject"), ebody);
                    work.push(sesClient.send(comm));
                } else {
                    console.log(`Player ${player.name} (${player.id}) has elected to not receive game start notifications.`);
                }
            } else {
                console.log(`No verified email address found for ${player.name} (${player.id})`);
            }
            // push notifications are sent no matter what
            work.push(sendPush({
                userId: player.id,
                topic: "started",
                title: i18n.t("PUSH.titles.started"),
                body,
                url: "/",
            }));
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
    if (challenge !== undefined) {
      await initi18n('en');
      // Inform everyone (except the decliner, he knows).
      const players: FullUser[] = await getPlayers(challenge.challengees!.map(c => c.id).filter(id => id !== userid).concat(challenge.players.map(c => c.id)));
      const quitter = challenge.challengees!.find(c => c.id === userid)!.name;
      const metaGame = gameinfo.get(challenge.metaGame).name;
      for (const player of players) {
        await changeLanguageForPlayer(player);
        let body = i18n.t("ChallengeRejectedBody", { quitter, metaGame });
        if (comment !== ".") {
          body += " " + i18n.t("ChallengeResponseComment", { comment });
        }
        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
          if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.challenges) ) {
            const comm = createSendEmailCommand(player.email, player.name, i18n.t("ChallengeRejectedSubject"), body);
            work.push(sesClient.send(comm));
          } else {
              console.log(`Player ${player.name} (${player.id}) has elected to not receive challenge notifications.`);
          }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
            userId: player.id,
            topic: "challenges",
            title: i18n.t("PUSH.titles.declined"),
            body: body,
            url: "/",
        }));
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
  if (standing && !revoked) {
    if ( ("duration" in challenge) && (typeof challenge.duration === "number") && (challenge.duration > 0) ) {
      if (challenge.duration === 1) {
        expired = true;
      } else {
        console.log(`decrementing standing challenge ${challenge.metaGame + '#' + challenge.id} duration from ${challenge.duration} to ${challenge.duration - 1}`);
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
    list.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      UpdateExpression: "DELETE challenges_issued :c",
      ExpressionAttributeValues: { ":c": new Set([challenge.id]) }
    })));
    // Remove from challenged
    challenge.challengees.forEach((challengee: { id: string; }) => {
      list.push(sendCommandWithRetry(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": challengee.id },
        UpdateExpression: "DELETE challenges_received :c",
        ExpressionAttributeValues: { ":c": new Set([challenge.id]) }
      })));
    })
  } else if (
      revoked
      || challenge.numPlayers > 2 // Had to duplicate the standing challenge when someone accepted but there were still spots left. Remove the duplicated standing challenge
      || expired
      ) {
    // Remove from challenger
    console.log(`removing duplicated challenge ${standing ? challenge.metaGame + '#' + challenge.id : challenge.id} from challenger ${challenge.challenger.id}`);
    list.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": challenge.challenger.id },
      UpdateExpression: "DELETE challenges_standing :c",
      ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challenge.id]) }
    })));
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
    list.push(sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": player.id },
      UpdateExpression: "DELETE challenges_accepted :c",
      ExpressionAttributeValues: { ":c": new Set([standing ? challenge.metaGame + '#' + challenge.id : challenge.id]) }
    })));
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
    console.log(`removing challenge ${challenge.metaGame + '#' + challenge.id}`);
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
  const updateCommand = new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "METAGAMES", "sk": "COUNTS" },
    ExpressionAttributeNames: { "#g": metaGame },
    ExpressionAttributeValues: {":n": diff, ":zero": 0},
    UpdateExpression: "set #g.standingchallenges = if_not_exists(#g.standingchallenges, :zero) + :n",
  });
  
  try {
    return await ddbDocClient.send(updateCommand);
  } catch (error: any) {
    if (error.name === 'ValidationException') {
      console.log(`ValidationException updating METAGAMES/COUNTS standing challenges for new game ${metaGame}. Initializing nested attribute...`);
      
      // Fetch current METAGAMES/COUNTS record
      const countsData = await ddbDocClient.send(new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "METAGAMES", "sk": "COUNTS" }
      }));
      
      // Initialize the nested attribute for this game
      await verifyAndCorrectCountWithData(metaGame, "standingchallenges", 0, countsData);
      
      // Retry the original update
      return await ddbDocClient.send(updateCommand);
    }
    throw error;
  }
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
        rot = -90;
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
          "noExplore": challenge.noExplore || false,
          "state": state,
          "toMove": whoseTurn,
          "lastMoveTime": now,
          "gameStarted": now,
          "variants": engine.variants,
        }
      }));
    // this should be all the info we want to show on the "my games" summary page.
    const game = {
      "id": gameId,
      "metaGame": challenge.metaGame,
      "players": playersFull.map(p => {return {"id": p.id, "name": p.name, "time": challenge.clockStart * 3600000}}),
      "clockHard": challenge.clockHard,
      "noExplore": challenge.noExplore || false,
      "toMove": whoseTurn,
      "lastMoveTime": now,
      "variants": engine.variants,
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
      const updatedGameIDs = [game.id];
      list.push(updateUserGames(player.id, player.gamesUpdate, updatedGameIDs, games));
    });
    try {
      await Promise.all(list);
      return { metaGame: info.name, players: playersFull, simultaneous: info.flags !== undefined && info.flags.includes('simultaneous'), gameId };
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
    const challengeValue = new Set([standing ? challenge.metaGame + '#' + challengeId : challengeId]);

    // Delete from received challenges
    const deleteFromReceived = sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      UpdateExpression: "DELETE challenges_received :c",
      ExpressionAttributeValues: { ":c": challengeValue }
    }));

    // Add to accepted challenges (top-level only)
    const addToAccepted = sendCommandWithRetry(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "USER", "sk": userid },
      UpdateExpression: "ADD challenges_accepted :c",
      ExpressionAttributeValues: { ":c": challengeValue }
    }));

    await Promise.all([updateChallenge, deleteFromReceived, addToAccepted]);
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
        "challengees": [challenge.challenger, newplayer], // users that have accepted
        "clockStart": challenge.clockStart,
        "clockInc": challenge.clockInc,
        "clockMax": challenge.clockMax,
        "clockHard": challenge.clockHard,
        "noExplore": challenge.noExplore || false,
        "rated": challenge.rated,
        "dateIssued": challenge.dateIssued,
      }
    }));

  const updateStandingChallengeCnt = updateStandingChallengeCount(challenge.metaGame, 1);

  const updateChallenger = ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "USER", "sk": challenge.challenger.id },
    ExpressionAttributeValues: { ":c": new Set([challenge.metaGame + '#' + challengeId]) },
    ExpressionAttributeNames: { "#cs": "challenges_standing" },
    UpdateExpression: "add #cs :c",
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

async function getPlayersSlowly(playerIDs: string[]) {
  const players: FullUser[] = [];
  for (const id of playerIDs) {
    try {
      const playerData = await ddbDocClient.send(
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
      throw error;
    }
  }
  return players;
}

async function addToGameLists(type: string, game: Game, now: number, keepgame: boolean) {
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
    const updateCommand = new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: {":n": 1, ":zero": 0},
      UpdateExpression: "set #g.currentgames = if_not_exists(#g.currentgames, :zero) + :n"
    });
    
    work.push(
      sendCommandWithRetry(updateCommand).catch(async (error) => {
        if (error.name === 'ValidationException') {
          console.log(`ValidationException updating METAGAMES/COUNTS for new game ${game.metaGame}. Initializing nested attribute...`);
          
          // Fetch current METAGAMES/COUNTS record
          const countsData = await ddbDocClient.send(new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "METAGAMES", "sk": "COUNTS" }
          }));
          
          // Initialize the nested attribute for this game
          await verifyAndCorrectCountWithData(game.metaGame, "currentgames", 0, countsData);
          
          // Retry the original update
          return sendCommandWithRetry(updateCommand);
        }
        throw error;
      })
    );
  } else {
    let update = "set #g.currentgames = if_not_exists(#g.currentgames, :zero) + :nm";
    const eavObj: {[k: string]: number} = {":nm": -1, ":zero": 0};
    if (keepgame) {
        update += ", #g.completedgames = if_not_exists(#g.completedgames, :zero) + :n";
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

function deleteFromGameLists(type: string, game: FullGame) {
  const work: Promise<any>[] = [];
  if (type === "COMPLETEDGAMES") {
    const sk = game.lastMoveTime + "#" + game.id;
    work.push(ddbDocClient.send(new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "COMPLETEDGAMES", "sk": sk
      },
    })));
    work.push(ddbDocClient.send(new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "COMPLETEDGAMES#" + game.metaGame, "sk": sk
      },
    })));
    game.players.forEach((player: { id: string; }) => {
      work.push(ddbDocClient.send(new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "COMPLETEDGAMES#" + player.id, "sk": sk
        },
      })));
      work.push(ddbDocClient.send(new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "COMPLETEDGAMES#" + game.metaGame + "#" + player.id, "sk": sk
        },
      })));
    });
  }
  if (type === "CURRENTGAMES") {
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "METAGAMES", "sk": "COUNTS" },
      ExpressionAttributeNames: { "#g": game.metaGame },
      ExpressionAttributeValues: {":n": -1, ":zero": 0},
      UpdateExpression: "set #g.currentgames = if_not_exists(#g.currentgames, :zero) + :n"
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
    let moveForced = false;
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
        moveForced = applyMove(userid, pars.move, engine, game, flags);
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
    if (pars.draw === "drawoffer" && !moveForced) {
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
      "noExplore": game.noExplore || false,
      "lastMoveTime": timestamp,
      "numMoves": engine.stack.length - 1,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
      "variants": engine.variants
    } as Game;
    if (engine.gameover) {
        playerGame.gameEnded = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
        playerGame.winner = engine.winner;
    }
    const list: Promise<any>[] = [];
    let newRatings: {[metaGame: string] : Rating}[] | null = null;
    if ((game.toMove === "" || game.toMove === null)) {
      newRatings = updateRatings(game, players);
      list.push(addToGameLists("COMPLETEDGAMES", {...playerGame, commented: game.commented}, timestamp, game.numMoves !== undefined && game.numMoves > game.numPlayers));
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

      /*
            As originally conceived, notes were part of the PLAYER record and were thus retained
            until the game was cleared from the record. But when moving them to a separate record,
            now they're being deleted immediately. So for now, let's not delete the notes until
            I can find a way to schedule deletions.
       */
      // TODO: Find a way to schedule deletions
      // delete associated notes
    //   try {
    //     const notesData = await ddbDocClient.send(
    //         new QueryCommand({
    //           TableName: process.env.ABSTRACT_PLAY_TABLE,
    //           KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
    //           ExpressionAttributeValues: { ":pk": "NOTE", ":sk": game.id },
    //           ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
    //           ProjectionExpression: "#pk, #sk"
    //     }));
    //     if ( (notesData.Items) && (notesData.Items.length > 0) ) {
    //         const notesList = notesData.Items as Note[];
    //         for (const note of notesList) {
    //             list.push(ddbDocClient.send(
    //                 new DeleteCommand({
    //                   TableName: process.env.ABSTRACT_PLAY_TABLE,
    //                   Key: {
    //                     "pk": note.pk,
    //                     "sk": note.sk
    //                   }
    //                 })
    //             ));
    //         }
    //     }
    //   } catch (err) {
    //     logGetItemError(err);
    //     return formatReturnError('Unable to process submit move');
    //   }
      if (game.tournament !== undefined) {
        list.push(tournamentUpdates(game, players, pars.move === "timeout" ? parseInt(game.toMove) : undefined));
      }
      if (game.event !== undefined) {
        const winners = engine.winner.map(n => players[n-1]).map (p => p.id);
        list.push(eventUpdates({eventid: game.event, gameid: pars.id, winner: winners}))
      }
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
      const updatedGames: string[] = [];
      playerGame.toMove = game.toMove;
      player.games.forEach(g => {
        if (g.id === playerGame.id) {
          if (player.id === userid) {
            if (game.toMove === "" || game.toMove === null)
              games.push({...playerGame, seen: Date.now()});
            else
              games.push(playerGame);
          }
          else {
            games.push(playerGame);
          }
          updatedGames.push(g.id);
        }
        else
          games.push(g)
      });
      list.push(updateUserGames(player.id, player.gamesUpdate, updatedGames, games));
      console.log(`Scheduled update to player ${player.id}, ${player.name}, with games`, games);
      if (newRatings !== null) {
        list.push(
          ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "USER", "sk": player.id },
            ExpressionAttributeValues: { ":rs": newRatings[ind] },
            UpdateExpression: "set ratings = :rs"
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
        console.log(`Scheduled update ratings`, newRatings[ind][game.metaGame]);

        list.push(ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "METAGAMES", "sk": "COUNTS" },
          ExpressionAttributeNames: { "#gr": game.metaGame + "_ratings" },
          ExpressionAttributeValues: { ":p": new Set([player.id]) },
          UpdateExpression: "add #gr :p",
        })));
        console.log(`Scheduled update to metagame ratings counts with player ${player.id}`);
      }
    });

    if (simultaneous)
      game.partialMove = game.players.map((p: User, i: number) => (p.id === userid ? game.partialMove!.split(',')[i] : '')).join(',');

    list.push(sendSubmittedMoveEmails(game, players, simultaneous, newRatings));
    console.log("Scheduled emails");

    await realPingBot(game.metaGame, game.id, game);
    await Promise.all(list);

    // TODO: Rehydrate state, run it through the stripper, and then replace with the new, stripped state
    if (game.gameEnded === undefined) {
        const engine = GameFactory(game.metaGame, game.state);
        if (engine === undefined) {
            throw new Error(`Could not rehydrate the state for id "${pars.id}", meta "${pars.metaGame}".`);
        }
        if (!engine.gameover) {
            let player: number|undefined;
            const pidx = game.players.findIndex(p => p.id === userid);
            if (pidx >= 0) {
                player = pidx + 1;
            }
            game.state = engine.serialize({strip: true, player});
        }
    }

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

async function tournamentUpdates(game: FullGame, players: FullUser[], timeout: number | undefined ) {
  let work: Promise<any>[] = [];
  for (let i = 0; i < 2; i++) {
    const player = players[i];
    let score = 0;
    if (game.winner?.length === 1 && game.players[game.winner[0] - 1].id === player.id) {
      score = 1;
    } else if (game.winner?.length === 2) {
      score = 0.5;
    }
    console.log(`player ${player.name} now has score ${score} in game ${game.id} from tournament ${game.tournament}`);
    work.push(ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTPLAYER", "sk": game.tournament + '#' + game.division!.toString() + '#' + player.id },
      ExpressionAttributeNames: { "#s": "score", "#t": "timeout" },
      ExpressionAttributeValues: { ":inc": score, ":t": i === timeout },
      UpdateExpression: "add #s :inc set #t = :t"
    })));
  }
  const winner = game.winner?.map((w: number) => game.players[w - 1].id);
  work.push(ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "TOURNAMENTGAME", "sk": game.tournament + '#' + game.division!.toString() + '#' + game.id },
    ExpressionAttributeNames: { "#w": "winner" },
    ExpressionAttributeValues: { ":w": winner },
    UpdateExpression: "set #w = :w"
  })));
  const tournamentData = await ddbDocClient.send(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { "pk": "TOURNAMENT", "sk": game.tournament },
    ExpressionAttributeNames: { "#d": "divisions", "#n": game.division!.toString() },
    ExpressionAttributeValues: { ":inc": 1, ":zero": 0 },
    UpdateExpression: "set #d.#n.numCompleted = if_not_exists(#d.#n.numCompleted, :zero) + :inc",
    ReturnValues: "ALL_NEW"
  }));
  const tournament = tournamentData.Attributes as Tournament;
  let divisionCompleted = false;
  for (const division of Object.values(tournament.divisions!)) {
    if (division.numCompleted === division.numGames && !division.processed) {
      divisionCompleted = true;
      break;
    }
  }
  if (divisionCompleted) {
    console.log("division completed, processing tournament");
    await Promise.all(work);
    work = [];
    work.push(endTournament(tournament))
  }
  return Promise.all(work);
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
    const players = players0.filter(p => playerIds.includes(p.id));
    const metaGame = gameinfo.get(game.metaGame).name;
    // Realtime YourTurn notifications are only sent by push
    for (const player of players) {
      await changeLanguageForPlayer(player);
      work.push(sendPush({
          userId: player.id,
          topic: "yourturn",
          title: i18n.t("PUSH.titles.yourturn"),
          body: i18n.t("YourMoveBody", { metaGame }),
          url: `/move/${game.metaGame}/0/${game.id}`,
      }));
    }
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
            body.push(i18n.t("GameOverRating", {"rating" : `${Math.round(newRatings[ind][game.metaGame].rating)}` }));
        }
        //   - Final scores, if applicable
        if (scores.length > 0) {
            body.push(i18n.t("GameOverScores", {scores: scores.join(", ")}))
        }
        //   - Direct link to game
        body.push(i18n.t("GameOverLink", {metaGame: game.metaGame, gameID: game.id}));

        if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
            if ( (player.settings?.all?.notifications === undefined) || (player.settings.all.notifications.gameEnd) ) {
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("GameOverSubject"), body.join(" "));
                work.push(sesClient.send(comm));
            } else {
                console.log(`Player ${player.name} (${player.id}) has elected to not receive game end notifications.`);
            }
        } else {
            console.log(`No verified email address found for ${player.name} (${player.id})`);
        }
        // push notifications are sent no matter what
        work.push(sendPush({
            userId: player.id,
            topic: "ended",
            title: i18n.t("PUSH.titles.ended"),
            body: body.join(" "),
            url: `/move/${game.metaGame}/1/${game.id}`,
        }));
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
  game.state = engine.serialize();
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  } else {
    const flags = gameinfo.get(game.metaGame).flags;
    const simultaneous = flags !== undefined && flags.includes('simultaneous');
    if (simultaneous) {
        applySimultaneousMove(userid, "resign", engine as GameBaseSimultaneous, game);
    } else {
        applyMove(userid, "resign", engine, game, flags);
    }
  }
}

function timeout(userid: string, engine: GameBase|GameBaseSimultaneous, game: FullGame) {
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
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  } else {
    const loserid = game.players[loser].id;
    const flags = gameinfo.get(game.metaGame).flags;
    const simultaneous = flags !== undefined && flags.includes('simultaneous');
    if (simultaneous) {
        applySimultaneousMove(loserid, "timeout", engine as GameBaseSimultaneous, game);
    } else {
        applyMove(loserid, "timeout", engine, game, flags);
    }
  }
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

async function timeloss(check: boolean, player: number, gameid: string, metaGame: string, timestamp: number) {
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
  if (check) {
    console.log("game.toMove", game.toMove);
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
        player = minIndex;
      } else {
        throw "Nobody's time is up!";
      }
    } else {
      if (game.toMove === "")
        throw "Game is already over!";
      const toMove = parseInt(game.toMove);
      if (game.players[toMove].time! - (Date.now() - game.lastMoveTime) < 0) {
        player = toMove;
      } else {
        throw "Opponent's time isn't up!";
      }
    }
  }
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
  const players = await getPlayers(playerIDs);

  // this should be all the info we want to show on the "my games" summary page.
  const playerGame = {
    "id": game.id,
    "metaGame": game.metaGame,
    "players": game.players,
    "clockHard": game.clockHard,
    "noExplore": game.noExplore || false,
    "winner": game.winner,
    "toMove": game.toMove,
    "lastMoveTime": game.lastMoveTime,
    "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
    "gameEnded": new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
    "numMoves": engine.stack.length - 1,
    "variants": engine.variants,
  } as Game;
  const work: Promise<any>[] = [];
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
    const updatedGameIds = [playerGame.id];
    work.push(updateUserGames(player.id, player.gamesUpdate, updatedGameIds, games));
    if (newRatings !== null) {
      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "USER", "sk": player.id },
        ExpressionAttributeValues: { ":rs": newRatings[ind] },
        UpdateExpression: "set ratings = :rs"
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
        ExpressionAttributeNames: { "#gr": game.metaGame + "_ratings" },
        ExpressionAttributeValues: {":p": new Set([player.id])},
        UpdateExpression: "add #gr :p",
      })));
    }
  });
  if (game.tournament !== undefined) {
    work.push(tournamentUpdates(game, players, player));
  }
  await Promise.all(work);
  return game;
}

async function checkForAbandonedGame(userid: string, pars: { id: string, metaGame: string}) {
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
    throw new Error(`Unable to get game ${pars.metaGame}, ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (!data.Item)
    throw new Error(`No game ${pars.metaGame}, ${pars.id} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);

  try {
    const game = data.Item as FullGame;
    const playerIDs = game.players.map((p: { id: any; }) => p.id);
    const players = await getPlayers(playerIDs);
    const now = Date.now();
    if (
      game.toMove == ""
      || game.clockHard
      || players.some(p => p.lastSeen !== undefined && p.lastSeen > now - 30 * 24 * 60 * 60 * 1000)
      || game.lastMoveTime > now - 30 * 24 * 60 * 60 * 1000
    ) {
      return {
        statusCode: 200,
        body: "not_abandoned",
        headers
      };
    }
    const engine = GameFactory(game.metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${game.metaGame}`);
    engine.abandoned();
    game.state = engine.serialize();
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
    game.lastMoveTime = now;

    // this should be all the info we want to show on the "my games" summary page.
    const playerGame = {
      "id": game.id,
      "metaGame": game.metaGame,
      "players": game.players,
      "clockHard": game.clockHard,
      "noExplore": game.noExplore || false,
      "winner": game.winner,
      "toMove": game.toMove,
      "lastMoveTime": game.lastMoveTime,
      "gameStarted": new Date(engine.stack[0]._timestamp).getTime(),
      "gameEnded": new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime(),
      "numMoves": engine.stack.length - 1,
      "variants": engine.variants,
    } as Game;
    const work: Promise<any>[] = [];
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

    // Update players
    players.forEach((player, ind) => {
      const games: Game[] = [];
      player.games.forEach(g => {
        if (g.id === playerGame.id)
          games.push(playerGame);
        else
          games.push(g)
      });
      const updatedGameIds = [playerGame.id];
      work.push(updateUserGames(player.id, player.gamesUpdate, updatedGameIds, games));
    });
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError('Error in checking for abandoned game');
  }
}

async function checkForTimeloss(userid: string, pars: { id: string, metaGame: string}) {
  try {
    const game = await timeloss(true, -1, pars.id, pars.metaGame, Date.now());
    return {
      statusCode: 200,
      body: JSON.stringify(game),
      headers
    };
  }
  catch (error) {
    // eslint-disable-next-line no-constant-condition
    if (error === "Nobody's time is up!" || error === "Opponent's time isn't up!" || "Game is already over!") {
      return {
        statusCode: 200,
        body: "not_a_timeloss",
        headers
      };
    }
    logGetItemError(error);
    return formatReturnError('Unable to process check for timeloss');
  }
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
    engine.move(game.partialMove, {partial: true});
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
    else {
        game.toMove = game.players.map((p, i) => ! engine.isEliminated(i + 1));
    }
  }
}

function applyMove(userid: string, move: string, engine: GameBase, game: FullGame, flags: string[]): boolean {
  // non simultaneous move game.
  if (game.players[parseInt(game.toMove as string)].id !== userid) {
    throw new Error('It is not your turn!');
  }
  let moveForced = false;
  engine.move(move);
  if (flags !== undefined && flags.includes("automove")) {
    // @ts-ignore
    while (engine.moves().length === 1) {
        if (flags.includes("pie-even") && engine.state().stack.length === 2) break;
        // @ts-ignore
        engine.move(engine.moves()[0]);
        moveForced = true;
    }
  } else if (flags !== undefined && flags.includes("autopass")) {
    // @ts-ignore
    while (engine.moves().length === 1 && engine.moves()[0] === "pass") {
        if (flags.includes("pie-even") && engine.state().stack.length === 2) break;
        // @ts-ignore
        engine.move(engine.moves()[0]);
        moveForced = true;
    }
  }
  game.state = engine.serialize();
  if (engine.gameover) {
    game.toMove = "";
    game.winner = engine.winner;
    game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
  } else {
    if ( (! ("currplayer" in engine)) || (engine.currplayer === undefined) || (engine.currplayer === null) || (typeof engine.currplayer !== "number") ) {
        throw new Error("The engine must provide a current player for `applyMove()` to be able to function.");
    }
    game.toMove = `${engine.currplayer - 1}`;
  }
  return moveForced;
}

async function submitComment(userid: string, pars: { id: string; players?: {[k: string]: any; id: string}[]; metaGame?: string, comment: string; moveNumber: number; updateCommented?: number; }) {
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
  
  // Update the commented flag for ongoing games if requested
  if (pars.updateCommented !== undefined && pars.updateCommented === 1 && pars.metaGame) {
    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { 
          "pk": "GAME", 
          "sk": pars.metaGame + "#0#" + pars.id 
        },
        ExpressionAttributeValues: { ":c": 1 },
        UpdateExpression: "set commented = :c",
      }));
      console.log(`Updated commented flag to 1 for game ${pars.id}`);
    } catch (error) {
      console.log(`Failed to update commented flag for game ${pars.id}:`, error);
      // Don't fail the whole operation just because of the flag update
    }
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

async function saveExploration(userid: string, pars: { public: boolean, game: string; metaGame: string; move: number; version: number; tree: Exploration; updateCommentedFlag?: number; gameEnded?: number; }) {
  // If we need to update the commented flag for a completed game
  if (pars.updateCommentedFlag !== undefined && pars.public && pars.gameEnded !== undefined) {
    // Update the commented flag in COMPLETEDGAMES
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { 
        "pk": "COMPLETEDGAMES#" + pars.metaGame, 
        "sk": pars.game + "#" + pars.gameEnded
      },
      ExpressionAttributeValues: { ":c": pars.updateCommentedFlag },
      UpdateExpression: "set commented = :c",
    }));
    
    console.log(`Updated commented flag for completed game ${pars.game} to ${pars.updateCommentedFlag}`);
  }
  
  if (!pars.public) {
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
  } else {
    try {
      console.log("Trying to update public exploration at key " + JSON.stringify({ "pk": "PUBLICEXPLORATION#" + pars.game, "sk": `${pars.move}` }));
      await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "PUBLICEXPLORATION#" + pars.game, "sk": `${pars.move}` },
        ExpressionAttributeValues: { ":v": pars.version, ":inc": 1, ":t": JSON.stringify(pars.tree) },
        ExpressionAttributeNames: { "#v": "version", "#t": "tree" },
        ConditionExpression: "#v = :v",
        UpdateExpression: "set #v = :v + :inc, #t = :t"
      }));
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        // Either nothing here yet, or somebody else has updated the tree. Send back to the front end to merge and try to save again.
        console.log("Failed to update public exploration, trying to get it.")
        const explorationData = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "PUBLICEXPLORATION#" + pars.game,
              "sk": `${pars.move}`
            },
          }));
        let exploration: Exploration | undefined = undefined;
        if (explorationData.Item === undefined) {
          console.log("Nothing here yet, try inserting.");
          // try to insert
          try {
            await ddbDocClient.send(new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: {
                "pk": "PUBLICEXPLORATION#" + pars.game,
                "sk": `${pars.move}`,
                "version": pars.version + 1,
                "game": pars.game,
                "tree": JSON.stringify(pars.tree)
              },
              ConditionExpression: "attribute_not_exists(sk)"
            }));
          }
          catch (error: any) {
            if (err.name === 'ConditionalCheckFailedException') {
              console.log("Wow, that was unlikely. Failed to insert public exploration, trying to get it.")
              // Somebody else has updated the tree. Send back to the front end to merge and try to save again.
              const explorationData = await ddbDocClient.send(
                new GetCommand({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "PUBLICEXPLORATION#" + pars.game,
                    "sk": `${pars.move}`
                  },
                }));
              exploration = explorationData.Item as Exploration;
            } else {
              logGetItemError(err);
              return formatReturnError(`Unable to save exploration data for game ${pars.game} move ${pars.move}`);
            }
          }
          if (exploration === undefined) {
            console.log("Successfully inserted public exploration, returning to client.");
            return;
          }
        } else {
          exploration = explorationData.Item as Exploration;
        }
        return {
          statusCode: 200,
          body: JSON.stringify(exploration),
          headers
        };
      }
      else {
        logGetItemError(err);
        return formatReturnError(`Unable to save exploration data for game ${pars.game} move ${pars.move}`);
      }
    }
  }
}

async function getExploration(userid: string, pars: { game: string; move: number }) {
  const work: Promise<any>[] = [];
  try {
    // get exploration you did while looking at this position in a previous visit to the game
    work.push(ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAMEEXPLORATION#" + pars.game,
          "sk": userid + "#" + pars.move
          },
      })
    ));
    // also get exploration you did while you opponent was on move, or if it is his move, the exploration you did for your last move.
    if (pars.move > 0) {
      work.push(ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAMEEXPLORATION#" + pars.game,
            "sk": userid + "#" + (pars.move - 1)
            },
        })
      ));
    }
    // and exploration you did when it was last your move. No need to further back because that exploration would have been merged when it was
    // last your move (unless you turned off exploration for that move, but...)
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

// This is for publishing your "during game" exploration for all to see after the game ends.
async function getPrivateExploration(userid: string, pars: { id: string }) {
  let data;
  try {
    data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        ExpressionAttributeValues: { ":pk": "GAMEEXPLORATION#" + pars.id, ":sk": userid + "#" },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" }
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get exploration data for game ${pars.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const trees = data.Items;
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}

// Mark a game as having had its exploration (for one of the players) published.
async function markAsPublished(userid: string, pars: { id: string; metagame: string }) {
  try {
    const data = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "GAME",
          "sk": pars.metagame + "#1#" + pars.id
        },
      }));
    if (!data.Item)
      throw new Error(`No game ${pars.metagame + "#1#" + pars.id} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    const game = data.Item as FullGame;
    if (!game.players.find((p: { id: any; }) => p.id === userid))
      throw new Error(`Only players can publish exploration!`);
    let published: string[] = [];
    if (game.published)
      published = game.published;
    if (published.includes(userid))
      throw new Error(`${userid} has already published for game ${pars.id}`);
    published.push(userid);
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "GAME", "sk": pars.metagame + "#1#" + pars.id },
      ExpressionAttributeValues: { ":p": published },
      UpdateExpression: "set published = :p"
    }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to mark game ${pars.id} as published`);
  }
}

async function getPublicExploration(pars: { game: string }) {
  let data;
  try {
    data = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "PUBLICEXPLORATION#" + pars.game },
        ExpressionAttributeNames: { "#pk": "pk"}
      }));
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get public exploration data for game ${pars.game}`);
  }
  if (data.Items === undefined) {
    return;
  }
  console.log("Got public exploration data", data.Items);
  const trees = data.Items.map((d: any) => {return {move: d.sk, version: d.version, tree: d.tree}});
  return {
    statusCode: 200,
    body: JSON.stringify(trees),
    headers
  };
}

async function botMove(pars: {uid: string, token: string, metaGame: string, gameid: string, move: string}) {
    // validate token
    try {
        if (! validateToken(process.env.TOTP_KEY as string, pars.token, 2)) {
            return formatReturnError(`Invalid token provided: ${JSON.stringify(pars)}`);
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Something went wrong while validating the token: ${JSON.stringify(pars)}`);
    }

    // fetch game record and state
    let game: FullGame|undefined;
    try {
        const data = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "GAME",
              "sk": pars.metaGame + "#0#" + pars.gameid
            },
          }));
        if (!data.Item)
          throw new Error(`No game ${pars.metaGame + "#0#" + pars.gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
        game = data.Item as FullGame;
    }
    catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to load game ${pars.gameid} to make a bot move`);
    }

    // instantiate game object
    if (game === undefined) {
        throw new Error("Unable to load game object");
    }
    const engine = GameFactory(pars.metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${pars.metaGame}`);

    // check for pie
    if (pars.move === "Swap") {
        return await invokePie(pars.uid, {id: pars.gameid, metaGame: pars.metaGame, cbit: 0});
    }
    // check for triggered resignations (to clean up bot games)
    else if (pars.move === "resign") {
        return await submitMove(pars.uid, {id: pars.gameid, move: pars.move, metaGame: pars.metaGame, cbit: 0, draw: ""});
    }
    // all other moves
    else {
        // translate move
        const realmove = engine.translateAiai(pars.move);

        if (realmove === "Swap") {
            return await invokePie(pars.uid, {id: pars.gameid, metaGame: pars.metaGame, cbit: 0});
        }

        // apply move
        return await submitMove(pars.uid, {id: pars.gameid, move: realmove, metaGame: pars.metaGame, cbit: 0, draw: ""});
    }

}

async function newTournament(userid: string, pars: { metaGame: string, variants: string[] }) {
  const variantsKey = pars.variants.sort().join("|");
  const sk = pars.metaGame + "#" + variantsKey;
  let tournamentN = 0;
  let available = true;
  try {
    const tournamentNumber = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TOURNAMENTSCOUNTER",
            "sk": sk
          },
        })
    );
    if (tournamentNumber.Item !== undefined) {
      tournamentN = tournamentNumber.Item.count;
      available = tournamentNumber.Item.over;
      // console.log(`Found tournament ${sk} with count ${tournamentN} and over ${available}`);
    }
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to fetch TOURNAMENTSCOUNTER for '${sk}'`);
  }
  if (!available) {
    return formatReturnError(`There is already a tournament for '${pars.metaGame}#${variantsKey}'`);
  }
  // Try to update counter
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTSCOUNTER", "sk": sk },
      ExpressionAttributeValues: { ":val": tournamentN, ":inc": 1, ":zero": 0, ":f": false },
      ExpressionAttributeNames: { "#count": "count", "#over": "over"},
      ConditionExpression: "attribute_not_exists(#count) OR #count = :val",
      UpdateExpression: "set #count = if_not_exists(#count, :zero) + :inc, #over = :f"
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Failed to update TOURNAMENTSCOUNTER, probably someone else beat us to it. So no harm done.
      console.log(`Failed to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
      return;
    }
    handleCommonErrors(err as {code: any; message: any});
    console.log(err);
    return formatReturnError(`Unable to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  // Insert tournament
  const tournamentid = uuid();
  const data: Tournament = {
    "pk": "TOURNAMENT",
    "sk": tournamentid,
    "id": tournamentid,
    "metaGame": pars.metaGame,
    "variants": pars.variants,
    "number": tournamentN + 1,
    "started": false,
    "dateCreated": Date.now(),
    "datePreviousEnded": 0
  };
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    handleCommonErrors(err as {code: any; message: any});
    return formatReturnError(`Unable to insert tournament for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  const ret = await joinTournament(userid, {tournamentid: tournamentid});
  if (ret === undefined) {
    return {
      statusCode: 200,
      body: "New tournament created",
      headers
    };
  } else {
    return ret;
  }
}

async function joinTournament(userid: string, pars: { tournamentid: string, once?: boolean }) {
  let tournament: Tournament;
  let playername = '';
  let once = false;
  if (pars.once !== undefined && pars.once) {
    once = true;
  }
  try {
    const tournamentGet = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    const user = ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "USERS",
          "sk": userid
        },
      }));
    const [tournamentData, userData] = await Promise.all([tournamentGet, user]);
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
    playername = (userData.Item as User).name;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (tournament.started)
    return formatReturnError(`Tournament ${pars.tournamentid} has already started`);
  const sk = `${pars.tournamentid}#1#${userid}`;
  const data: TournamentPlayer = {
    "pk": "TOURNAMENTPLAYER",
    "sk": sk,
    "playername": playername,
    "playerid": userid,
    "once": once,
  };
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to add player ${userid} to tournament ${pars.tournamentid}`);
  }
}

async function withdrawTournament(userid: string, pars: { tournamentid: string }) {
  let tournament: Tournament;
  try {
    const tournamentData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  if (tournament.started)
    return formatReturnError(`Tournament ${pars.tournamentid} has already started`);
  const sk = `${pars.tournamentid}#1#${userid}`;
  try {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENTPLAYER", "sk": sk
        },
      })
    )
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to withdraw player ${userid} from tournament ${pars.tournamentid}`);
  }
}

async function getTournaments() {
  try {
    const tournamentsDataPromise = ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENT" },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    const tournamentPlayersDataPromise = ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER" },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    const [tournamentsData, tournamentPlayersData] = await Promise.all([tournamentsDataPromise, tournamentPlayersDataPromise]);
    return {
      statusCode: 200,
      body: JSON.stringify({tournaments: tournamentsData.Items, tournamentPlayers: tournamentPlayersData.Items}),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function getOldTournaments(pars: { metaGame: string }) {
  try {
    const tournamentsData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "COMPLETEDTOURNAMENT", ":sk": pars.metaGame + '#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
      }));
    return {
      statusCode: 200,
      body: JSON.stringify({tournaments: tournamentsData.Items}),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function archiveTournaments() {
  try {
    const tournamentsData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeValues: { ":pk": "TOURNAMENT" },
        ExpressionAttributeNames: { "#pk": "pk" }
      }));
    // Check for "old" tournaments and "archive" them. Old = the next one already ended or ended more than 6 months ago.
    const latestCompleted: Map<string, number> = new Map();
    for (const tournament of tournamentsData.Items as Tournament[]) {
      if (tournament.dateEnded !== undefined) {
        const key = tournament.metaGame + "#" + tournament.variants.sort().join("|");
        const latest = latestCompleted.get(key);
        if (latest === undefined || tournament.dateEnded > latest) {
          latestCompleted.set(key, tournament.dateEnded);
        }
      }
    }
    const now = Date.now();
    const work: Promise<any>[] = [];
    const list: string[] = [];
    for (const tournament of tournamentsData.Items as Tournament[]) {
      if (tournament.dateEnded !== undefined) {
        const key = tournament.metaGame + "#" + tournament.variants.sort().join("|");
        if (tournament.dateEnded < latestCompleted.get(key)! || tournament.dateEnded < now - 1000 * 60 * 60 * 24 * 30 * 60) {
          work.push(archiveTournament(tournament));
          list.push(tournament.id);
        }
      }
    }
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify({message: "Archived old tournaments: " + list.join(", ")}),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

async function archiveTournament(tournament: Tournament) {
  try {
    // Now that player won't change anymore, just add them to the tournament record and (more importantly) get them out of the TOURNAMENTPLAYER list
    const tournamentPlayersData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + '#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
      })
    );
    const players = tournamentPlayersData.Items as TournamentPlayer[];

    // Get all tournament games so we can update their tournament references
    const tournamentGamesData = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + '#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
      })
    );
    const tournamentGames = tournamentGamesData.Items as TournamentGame[];

    // add archive (by metaGame)
    tournament.pk = "COMPLETEDTOURNAMENT";
    tournament.sk = tournament.metaGame + "#" + tournament.id;
    tournament.players = players;
    const work: Promise<any>[] = [];
    work.push(ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: tournament
      })));

    // Update all games to reference the new archived tournament format
    const newTournamentRef = tournament.metaGame + "#" + tournament.id;
    for (const tournamentGame of tournamentGames) {
      // Update completed games (all tournament games should be completed when archiving)
      work.push(ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "GAME", "sk": tournament.metaGame + '#1#' + tournamentGame.id },
        ExpressionAttributeValues: { ":newTournamentRef": newTournamentRef },
        UpdateExpression: "set tournament = :newTournamentRef",
      })));
    }

    // delete tournament
    work.push(ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": tournament.id
        },
      })
    ));
    // and tournament players
    for (const player of players) {
      work.push(ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TOURNAMENTPLAYER",
            "sk": player.sk
          },
        })
      ));
    }
    return Promise.all(work);
  }
  catch (error) {
    logGetItemError(error);
  }
}

// gameId is only passed if we got here from a user that clicked on the "tournament" link in the game (and is used to fix broken references)
async function getTournament(pars: { tournamentid: string, metaGame: string, isArchived?: string, gameId?: string }) {
  try {
    const work: Promise<any>[] = [];
    const isArchived = pars.isArchived === 'true';
    let completedTournament = false;

    if (!isArchived) {
      // Look in active tournaments
      work.push(ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "TOURNAMENT", ":sk": pars.tournamentid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and #sk = :sk",
        })
      ));
      work.push(ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": pars.tournamentid + '#' },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        })
      ));
    } else {
      // Look in completed tournaments
      work.push(ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "COMPLETEDTOURNAMENT", ":sk": pars.metaGame + '#' + pars.tournamentid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and #sk = :sk",
        })
      ));
      completedTournament = true;
    }

    work.push(ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": pars.tournamentid + '#' },
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
      })
    ));

    const data = await Promise.all(work);

    // If tournament not found in active tournaments and we have gameId and metaGame, try archived
    if (!isArchived && pars.metaGame !== 'undefined' && data[0].Items.length === 0 && pars.gameId) {
      console.log(`Tournament ${pars.tournamentid} not found in active tournaments, trying completed tournaments`);

      const completedTournamentData = await ddbDocClient.send(
        new QueryCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          ExpressionAttributeValues: { ":pk": "COMPLETEDTOURNAMENT", ":sk": pars.metaGame + '#' + pars.tournamentid },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and #sk = :sk",
        })
      );

      if (completedTournamentData.Items && completedTournamentData.Items.length > 0) {
        console.log(`Found tournament ${pars.tournamentid} in completed tournaments, fixing game reference`);
        completedTournament = true;

        // Update the game's tournament reference to point to the new archived format
        const newTournamentRef = pars.metaGame + '#' + pars.tournamentid;

        // Since tournament is archived, all games must be completed - update completed game
        await ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "GAME", "sk": pars.metaGame + '#1#' + pars.gameId },
          ExpressionAttributeValues: { ":newTournamentRef": newTournamentRef },
          UpdateExpression: "set tournament = :newTournamentRef",
        }));

        // Replace the empty tournament data with the found completed tournament
        data[0] = completedTournamentData;
      }
    }

    if (!completedTournament) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          tournament: data[0].Items,
          tournamentPlayers: data[1]?.Items || [],
          tournamentGames: data[2].Items
        }),
        headers
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({
          tournament: data[0].Items,
          tournamentPlayers: [],
          tournamentGames: isArchived ? data[1].Items : data[2].Items
        }),
        headers
      };
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid}. Error: ${error}`);
  }
}

async function startTournaments() {
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
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Checked ${count} tournaments, started ${newcount} new tournaments, waiting for ${waitingcount} tournaments and cancelled ${cancelledcount} tournaments`
    }),
    headers
  };
}

async function startATournament(userId: string, pars: { tournamentid: string }) {
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
  let tournament: Tournament;
  try {
    const tournamentData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  const now = Date.now();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  const twoWeeks = oneWeek * 2;
  if (
    !tournament.started && now > tournament.dateCreated + twoWeeks
    && (tournament.datePreviousEnded === 0 || now > tournament.datePreviousEnded + oneWeek )
  ) {
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
    console.log(`Starting tournament ${tournament.id}`);
    if (await startTournament(users, tournament)) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Started"
        }),
        headers
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Failed to start"
        }),
        headers
      };
    }
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Tournament ${tournament.id} either already started, or not ready to start.`
    }),
    headers
  };
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
    return formatReturnError(`Unable to get players for tournament ${tournament.id} from table ${process.env.ABSTRACT_PLAY_TABLE}. Error: ${error}`);
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
      await ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "TOURNAMENT",
            "sk": tournament.id
          },
        }));
      const sk = tournament.metaGame + "#" + tournament.variants.sort().join("|");
      await ddbDocClient.send(
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
      return formatReturnError(`Unable to delete tournament ${tournament.id} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
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
      return formatReturnError(`Unable to delete tournament players from table ${process.env.ABSTRACT_PLAY_TABLE}`);
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
        await ddbDocClient.send(new UpdateCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: { "pk": "TOURNAMENT", "sk": tournament.id },
          ExpressionAttributeValues: { ":t": true },
          UpdateExpression: "set waiting = :t"
        }));
      }
      catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to update tournament ${tournament.id} to waiting`);
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
        await ddbDocClient.send(new PutCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Item: player
        }));
      }
      catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to add player ${player.playerid} to tournament ${tournament.id} with division ${division}. Error ${error}`);
      }
      if (division > 1) {
        try {
          console.log(`Deleting player ${player.playerid} from tournament ${tournament.id} with division 1 (so they can be put in the right division)`);
          await ddbDocClient.send(new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "TOURNAMENTPLAYER", "sk": tournament.id + "#1#" + player.playerid
            },
          }));
        }
        catch (error) {
          logGetItemError(error);
          return formatReturnError(`Unable to delete player ${player.playerid} from tournament ${tournament.id} with division 1. Error ${error}`);
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
            await ddbDocClient.send(new PutCommand({
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
            return formatReturnError(`Unable to create game ${gameId} for tournament ${tournament.id} with division ${division}. Error ${error}`);
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
          await ddbDocClient.send(new PutCommand({
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
    await ddbDocClient.send(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENT", "sk": tournament.id },
      ExpressionAttributeValues: { ":dt": now, ":t": true, ":nextid": newTournamentid, ":ds": divisions },
      UpdateExpression: "set started = :t, dateStarted = :dt, nextid = :nextid, divisions = :ds"
    }));
    // open next tournament for sign-up.
    console.log(`Opening next tournament ${newTournamentid} for sign-up. Update TOURNAMENTSCOUNTER for '${tournament.metaGame}#${tournament.variants.sort().join("|")}'`);
    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: { "pk": "TOURNAMENTSCOUNTER", "sk": tournament.metaGame + "#" + tournament.variants.sort().join("|") },
        ExpressionAttributeValues: { ":inc": 1, ":f": false },
        ExpressionAttributeNames: { "#count": "count", "#over": "over" },
        UpdateExpression: "set #count = #count + :inc, #over = :f"
      }));
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to update TOURNAMENTSCOUNTER for '${tournament.metaGame}#${tournament.variants.sort().join("|")}'. Error: ${err}`);
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
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Item: data
      }));
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError(`Unable to insert new tournament ${newTournamentid}. Error: ${error}`);
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
            await ddbDocClient.send(new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Item: playerdata
            }));
        } catch (err) {
            logGetItemError(err);
            return formatReturnError(`Unable to add player ${player.playerid} to tournament ${newTournamentid}`);
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
      await ddbDocClient.send(
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
      return formatReturnError(`Unable to get removed players for tournament ${tournament.id} from table ${process.env.ABSTRACT_PLAY_TABLE}. Error: ${error}`);
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
        return formatReturnError(`Failed to send email to player ${player.name}, ${player.email}. Error: ${error}`);
      }
    }
  }
  return returnvalue;
}

async function endATournament(userId: string, pars: { tournamentid: string }) {
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
  let tournament: Tournament;
  try {
    const tournamentData = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.ABSTRACT_PLAY_TABLE,
        Key: {
          "pk": "TOURNAMENT",
          "sk": pars.tournamentid
        },
      }));
    if (!tournamentData.Item)
      throw new Error(`No tournament ${pars.tournamentid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
    tournament = tournamentData.Item as Tournament;
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournament ${pars.tournamentid} from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
  return endTournament(tournament);
}

async function endTournament(tournament: Tournament) {
  try {
    if (tournament.divisions) {
      const work: Promise<any>[] = [];
      let alldone = true;
      let tournamentUpdated = false;
      for (const [divisionNumber, division] of Object.entries(tournament.divisions)) {
        if (division.numCompleted < division.numGames) {
          alldone = false;
        }
        if (division.numCompleted === division.numGames && !division.processed) {
          // Get games
          const work2: Promise<any>[] = [];
          work2.push(ddbDocClient.send(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
              ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + '#' + divisionNumber + '#' },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
            })));
          // And players (we need the ratings at the start of the tournament)
          work2.push(ddbDocClient.send(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + '#' + divisionNumber + '#' },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            })));
          const [gamesData, playersData] = await Promise.all(work2);
          const gamelist = gamesData.Items as TournamentGame[];
          const players = playersData.Items as TournamentPlayer[];
          const tournamentPlayers: Map<string, TournamentPlayer> = new Map();
          for (let i = 0; i < players.length; i++) {
            players[i].tiebreak = 0;
            players[i].score = 0;
            tournamentPlayers.set(players[i].playerid, players[i]);
          }
          for (const game of gamelist) {
            if (game.winner?.length === 2) {
              tournamentPlayers.get(game.player1)!.score! += 0.5;
              tournamentPlayers.get(game.player2)!.score! += 0.5;
            } else {
              tournamentPlayers.get(game.winner![0])!.score! += 1;
            }
          }
          for (const game of gamelist) {
            if (game.winner?.length === 2) {
              tournamentPlayers.get(game.player1)!.tiebreak! += tournamentPlayers.get(game.player2)!.score! / 2;
              tournamentPlayers.get(game.player2)!.tiebreak! += tournamentPlayers.get(game.player1)!.score! / 2;
            } else if (game.winner![0] === game.player1) {
              tournamentPlayers.get(game.player1)!.tiebreak! += tournamentPlayers.get(game.player2)!.score!;
            } else {
              tournamentPlayers.get(game.player2)!.tiebreak! += tournamentPlayers.get(game.player1)!.score!;
            }
          }
          // Find winner
          let bestScore = 0;
          let bestTiebreak = 0;
          let bestRating = 0;
          let bestPlayer = '';
          let bestPlayerName = '';
          for (const player of players) {
            if (player.score! > bestScore) {
              bestScore = player.score!;
              bestTiebreak = player.tiebreak!;
              bestRating = player.rating!;
              bestPlayer = player.playerid;
              bestPlayerName = player.playername;
            } else if (player.score! === bestScore) {
              if (player.tiebreak! > bestTiebreak) {
                bestTiebreak = player.tiebreak!;
                bestRating = player.rating!;
                bestPlayer = player.playerid;
                bestPlayerName = player.playername;
              } else if (player.tiebreak! === bestTiebreak) {
                if (player.rating! > bestRating) {
                  bestRating = player.rating!;
                  bestPlayer = player.playerid;
                  bestPlayerName = player.playername;
                }
              }
            }
          }
          division.processed = true;
          division.winnerid = bestPlayer;
          division.winner = bestPlayerName;
          // Update tournament players
          for (const player of players) {
            work.push(ddbDocClient.send(new UpdateCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.id}#${divisionNumber}#${player.playerid}` },
              ExpressionAttributeNames: { "#t": "tiebreak" },
              ExpressionAttributeValues: { ":t": player.tiebreak },
              UpdateExpression: "set #t = :t"
            })));
            if (player.timeout) {
              work.push(ddbDocClient.send(new UpdateCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.nextid}#1#${player.playerid}` },
                ExpressionAttributeNames: { "#t": "timeout" },
                ExpressionAttributeValues: { ":t": true },
                UpdateExpression: "set #t = :t",
                ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
              })).catch(error => {
                if (error.name === 'ConditionalCheckFailedException') {
                  console.log(`Player ${player.playerid} already left the next tournament, so no need to record timeout.`);
                } else {
                  throw error;
                }
              }));
            }
          }
          tournamentUpdated = true;
        }
      }
      if (tournamentUpdated) {
        // Update tournament
        if (!alldone) {
          work.push(ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions },
            UpdateExpression: "set divisions = :ds",
          })));
        } else {
          const now = Date.now();
          work.push(ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions, ":dt": now },
            UpdateExpression: "set divisions = :ds, dateEnded = :dt",
          })));
          // Start the clock for next tournament start
          work.push(ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.nextid },
            ExpressionAttributeValues: { ":dt": now },
            UpdateExpression: "set datePreviousEnded = :dt",
          })));
          // Send e-mails to participants
          // Now we need ALL players, not just the ones in the current division
          const playersData = await ddbDocClient.send(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            }));
          const players = playersData.Items as TournamentPlayer[];
          // And, in fact, full players (just for e-mail!? and language... Don't want to put these in the tournament player because then those will have to be maintained if e-mail or language changes)
          const playersFull = await getPlayers(players.map(p => p.playerid));
          await initi18n('en');
          const metaGameName = gameinfo.get(tournament.metaGame)?.name;
          for (const player of playersFull) {
            console.log(`Determining whether to send tournamentEnd email to the following player:\n${JSON.stringify(player)}`);
            // eslint-disable-next-line no-prototype-builtins
            if ( (player.settings?.all?.notifications === undefined) || (!player.settings.all.notifications.hasOwnProperty("tournamentEnd")) || (player.settings.all.notifications.tournamentEnd) ) {
                console.log("Sending email");
                await changeLanguageForPlayer(player);
                let body = '';
                if (tournament.variants.length === 0)
                    body = i18n.t("TournamentEndBody", { "metaGame": metaGameName, "number": tournament.number, "tournamentId": tournament.id });
                else
                    body = i18n.t("TournamentEndBodyVariants", { "metaGame": metaGameName, "number": tournament.number, "tournamentId": tournament.id, "variants": tournament.variants.join(", ") });
                if ( (player.email !== undefined) && (player.email !== null) && (player.email !== "") )  {
                    const comm = createSendEmailCommand(player.email, player.name, i18n.t("TournamentEndSubject", { "metaGame": metaGameName, }), body);
                    work.push(sesClient.send(comm));
                }
            }
          }
        }
      }
    }
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Error during update tournament ${tournament.id}: {error}`);
  }
  return {
    statusCode: 200,
    body: "Done",
    headers
  };
}

// ORGANIZED EVENTS
async function eventGetEvent(pars: {eventid: string}) {
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }

        const players = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));
        const games = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                ExpressionAttributeValues: { ":pk": "ORGEVENTGAME", ":sk": pars.eventid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));

        return {
            statusCode: 200,
            body: JSON.stringify({event: event.Item, players: players.Items, games: games.Items}),
            headers
        };
      }
      catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to get organized event ${pars.eventid}. Error: ${error}`);
      }
}

async function eventGetEvents() {
    try {
        const work: Promise<any>[] = [];
        work.push(ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "ORGEVENT" },
                ExpressionAttributeNames: { "#pk": "pk"},
        })));
        work.push(ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER" },
                ExpressionAttributeNames: { "#pk": "pk"},
        })));
        work.push(ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk",
                ExpressionAttributeValues: { ":pk": "ORGEVENTGAME" },
                ExpressionAttributeNames: { "#pk": "pk"},
        })));
        const data = await Promise.all(work);
        return {
            statusCode: 200,
            body: JSON.stringify({events: data[0].Items, players: data[1].Items, games: data[2].Items}),
            headers
        };
      }
      catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to get organized events. Error: ${error}`);
      }
}

async function eventCreate(userid: string, pars: {name: string, date: number, description: string}) {
    // authorize first
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            return {
                statusCode: 200,
                body: JSON.stringify({}),
                headers
            };
        }
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
    }
    try {
        const eventid = uuid();
        const eventRec: OrgEvent = {
            pk: "ORGEVENT",
            sk: eventid,
            name: pars.name,
            description: pars.description,
            organizer: userid,
            dateStart: pars.date,
            visible: false,
        };
        await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: eventRec,
              })
          );
          return {
            statusCode: 200,
            body: JSON.stringify({eventid}),
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to create event. Error: ${error}`);
    }
}

async function eventPublish(userid: string, pars: {eventid: string}) {
    // authorize first
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
    }
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
            return {
                statusCode: 401,
                headers
            };
        }
        // must be in the future and have nonempty description
        if (eventRec.dateStart <= Date.now() || /^\s*$/.test(eventRec.description)) {
            return {
                statusCode: 400,
                body: "The start date must be in the future and the description may not be empty.",
                headers,
            };
        }
        eventRec.visible = true;
        await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: eventRec,
              })
          );
        return {
            statusCode: 200,
            body: JSON.stringify(eventRec),
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to publish event ${pars.eventid}. Error: ${error}`);
    }
}

async function eventDelete(userid: string, pars: {eventid: string}) {
    // authorize first
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
    }
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
            return {
                statusCode: 401,
                headers
            };
        }
        // get associated players and games
        const players = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));
        const games = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                ExpressionAttributeValues: { ":pk": "ORGEVENTGAME", ":sk": pars.eventid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));

        // the event must not be over and there must not be any associated games
        if (eventRec.dateEnd !== undefined || (games.Items !== undefined && games.Items.length > 0)) {
            return {
                statusCode: 400,
                body: "You cannot delete events that are over or that have associated games.",
                headers,
            };
        }

        // delete associated player records
        if (players.Items !== undefined && players.Items.length > 0) {
            for (const {playerid} of players.Items as OrgEventPlayer[]) {
                await ddbDocClient.send(
                    new DeleteCommand({
                        TableName: process.env.ABSTRACT_PLAY_TABLE,
                        Key: {
                          "pk": "ORGEVENTPLAYER",
                          "sk": `${pars.eventid}#${playerid}`
                        },
                    })
                );
            }
        }

        // now delete the event itself
        await ddbDocClient.send(
            new DeleteCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                    "pk": "ORGEVENT",
                    "sk": pars.eventid,
                },
            })
        );
        return {
            statusCode: 200,
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to delete event ${pars.eventid}. Error: ${error}`);
    }
}

async function eventRegister(userid: string, pars: {eventid: string}) {
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        // must be open for registration
        if (!eventRec.visible || eventRec.dateStart < Date.now() || eventRec.dateEnd !== undefined) {
            return {
                statusCode: 400,
                body: "You may only register for events that are open for registration.",
                headers,
            };
        }
        const newRec: OrgEventPlayer = {
            pk: "ORGEVENTPLAYER",
            sk: `${pars.eventid}#${userid}`,
            playerid: userid,
        }
        await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: newRec,
            })
          );
        return {
            statusCode: 200,
            body: JSON.stringify(newRec),
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to register for event ${pars.eventid}. Error: ${error}`);
    }
}

async function eventWithdraw(userid: string, pars: {eventid: string}) {
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        // must be open for registration
        if (!eventRec.visible || eventRec.dateStart < Date.now() || eventRec.dateEnd !== undefined) {
            return {
                statusCode: 400,
                body: "You may only withdraw from events that are open for registration.",
                headers,
            };
        }
        await ddbDocClient.send(
            new DeleteCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                  "pk": "ORGEVENTPLAYER",
                  "sk": `${pars.eventid}#${userid}`
                },
            })
        );
        return {
            statusCode: 200,
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to withdraw from event ${pars.eventid}. Error: ${error}`);
    }
}

async function eventUpdateStart(userid: string, pars: {eventid: string, newDate: number}) {
    // authorize first
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
    }
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
            return {
                statusCode: 401,
                headers
            };
        }
        eventRec.dateStart = pars.newDate;
        await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: eventRec,
              })
          );
        return {
            statusCode: 200,
            body: JSON.stringify(eventRec),
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to update event start date. Error: ${error}`);
    }
}

async function eventUpdateName(userid: string, pars: {eventid: string, name: string}) {
    // authorize first
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
    }
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
            return {
                statusCode: 401,
                headers
            };
        }
        eventRec.name = pars.name;
        await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: eventRec,
              })
          );
        return {
            statusCode: 200,
            body: JSON.stringify(eventRec),
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to update event start date. Error: ${error}`);
    }
}

async function eventUpdateDesc(userid: string, pars: {eventid: string, description: string}) {
    // authorize first
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`createEvent: Unable to load user record to authorize ${userid}`);
    }
    try {
        const event = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (event.Item === undefined) {
            return {
                statusCode: 404,
                headers,
            };
        }
        const eventRec = event.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && eventRec.organizer !== userid)) {
            return {
                statusCode: 401,
                headers
            };
        }
        eventRec.description = pars.description;
        await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
                Item: eventRec,
              })
          );
        return {
            statusCode: 200,
            body: JSON.stringify(eventRec),
            headers
        };
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`Unable to update event start date. Error: ${error}`);
    }
}

type PairingPlayer = {
    id: string;
    name: string;
    country: string;
    stars: string[];
    lastSeen: number;
};
type Pairing = {
    round: number;
    metagame: string;
    variants: string[];
    clockStart: number;
    clockInc: number;
    clockMax: number;
    p1: PairingPlayer;
    p2: PairingPlayer
};

async function eventUpdateResult(userid: string, pars: {eventid: string, gameid: string, result: string[]}) {
    // load event and authorize requester
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
    }
    let event: OrgEvent;
    try {
        const eventRec = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (eventRec.Item === undefined) {
            console.log(`Error 404`);
            return {
                statusCode: 404,
                headers,
            };
        }
        event = eventRec.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
    }
    // update game record
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "ORGEVENTGAME", "sk": `${pars.eventid}#${pars.gameid}` },
            ExpressionAttributeValues: { ":win": pars.result, ":arb": true},
            UpdateExpression: "set winner = :win, arbitrated = :arb",
        }));
        return {
            statusCode: 200,
            headers
        };
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`eventUpdateResult: Unable to set result ${pars.result} for ${pars.eventid}#${pars.gameid}`);
    }
}

type DivisionTable = string[][];
async function eventUpdateDivisions(userid: string, pars: {eventid: string; divisions: DivisionTable}) {
    // (Do as much validation as possible before creating games and abort if anything's wrong.)
    console.log(`About to try updating division assignments for event ${pars.eventid}:\n${JSON.stringify(pars.divisions, null, 2)}`);
    // load event and authorize requester
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
    }
    let event: OrgEvent;
    try {
        const eventRec = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (eventRec.Item === undefined) {
            console.log(`Error 404`);
            return {
                statusCode: 404,
                headers,
            };
        }
        event = eventRec.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
    }
    // get list of registered players
    let eventPlayers: OrgEventPlayer[];
    try {
        const pRecs = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));
        if (pRecs.Items === undefined || pRecs.Items.length === 0) {
            console.log(`Error 400: No players`);
            return {
                statusCode: 400,
                body: "This event has no registered players!",
                headers
            };
        }
        eventPlayers = pRecs.Items as OrgEventPlayer[];
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to load registered players for event ${pars.eventid}. Error: ${error}`);
    }

    // ensure there are at least 2 divisions
    if (pars.divisions.length < 2) {
        console.log(`Error 400: Too few divisions`);
        return {
            statusCode: 400,
            body: `There must be at least two divisions.`,
            headers
        };
    }

    // ensure that each division has at least 2 players assigned
    if (Math.min(...pars.divisions.map(d => d.length)) < 2) {
        console.log(`Error 400: Too-small division`);
        return {
            statusCode: 400,
            body: `Each division must have at least two players assigned.`,
            headers
        };
    }

    // ensure that all assigned players are registered or abort
    const idsRegistered = eventPlayers.map(p => p.playerid);
    for (const uid of pars.divisions.flat()) {
        if (!idsRegistered.includes(uid)) {
            console.log(`Error 400: Unregistered player`);
            return {
                statusCode: 400,
                body: `You may not assign divisions to players not registered for this event.`,
                headers
            };
        }
    }

    // ensure that all participating players have been assigned or abort
    const setRegistrants = new Set<string>(idsRegistered);
    for (const uid of pars.divisions.flat()) {
        setRegistrants.delete(uid);
    }
    if (setRegistrants.size > 0) {
        console.log(`Error 400: Not all players assigned`);
        return {
            statusCode: 400,
            body: `All registered players must be assigned to a division.`,
            headers
        };
    }

    // ensure there are no duplicates anywhere
    const seen = new Set<string>(pars.divisions.flat());
    if (seen.size < pars.divisions.flat().length) {
        console.log(`Error 400: Duplicates`);
        return {
            statusCode: 400,
            body: `Players must only be assigned to one division. No duplicates allowed.`,
            headers
        };
    }

    const list: Promise<any>[] = [];
    try {
        // for each division
        for (let d = 0; d < pars.divisions.length; d++) {
            const division = pars.divisions[d];
            for (const pid of division) {
                const cmd = ddbDocClient.send(new UpdateCommand({
                    TableName: process.env.ABSTRACT_PLAY_TABLE,
                    Key: { "pk": "ORGEVENTPLAYER", "sk": `${pars.eventid}#${pid}` },
                    ExpressionAttributeValues: { ":div": d+1 },
                    UpdateExpression: "set division = :div",
                }));
                list.push(cmd);
            }
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventUpdateDivisions: Something went wrong assigning divisions for event ${pars.eventid}. Error: ${error}`);
    }
    // execute all updates
    try {
        await Promise.all(list);
        return {
            statusCode: 200,
            headers
        };
    } catch (error) {
        logGetItemError(error);
        throw new Error(`Something terrible happened while trying to assign divisions for event ${pars.eventid}`);
    }
}

async function eventCreateGames(userid: string, pars: {eventid: string; pairs: Pairing[]}) {
    // (Do as much validation as possible before creating games and abort if anything's wrong.)
    console.log(`About to try creating the following pairings for event ${pars.eventid}:\n${JSON.stringify(pars.pairs, null, 2)}`);
    // load event and authorize requester
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`eventCreateGames: Unable to load user record to authorize ${userid}`);
    }
    let event: OrgEvent;
    try {
        const eventRec = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (eventRec.Item === undefined) {
            console.log(`Error 404`);
            return {
                statusCode: 404,
                headers,
            };
        }
        event = eventRec.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
    }
    // get list of registered players
    let eventPlayers: OrgEventPlayer[];
    try {
        const pRecs = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
                ExpressionAttributeValues: { ":pk": "ORGEVENTPLAYER", ":sk": pars.eventid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        }));
        if (pRecs.Items === undefined || pRecs.Items.length === 0) {
            console.log(`Error 400: No players`);
            return {
                statusCode: 400,
                body: "This event has no registered players!",
                headers
            };
        }
        eventPlayers = pRecs.Items as OrgEventPlayer[];
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to load registered players for event ${pars.eventid}. Error: ${error}`);
    }
    // ensure that all paired players are registered or abort
    const idsRegistered = eventPlayers.map(p => p.playerid);
    for (const pair of pars.pairs) {
        if (!idsRegistered.includes(pair.p1.id) || !idsRegistered.includes(pair.p2.id)) {
            console.log(`Error 400: Unregistered player`);
            return {
                statusCode: 400,
                body: `You may not create games for players not registered for this event.`,
                headers
            };
        }
    }
    // load all player records to be paired
    const idsPaired = new Set<string>();
    for (const pair of pars.pairs) {
        idsPaired.add(pair.p1.id);
        idsPaired.add(pair.p2.id);
    }
    let players: FullUser[];
    try {
        players = await getPlayers([...idsPaired.values()]);
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to load full player records for registered players for event ${pars.eventid}. Error: ${error}`);
    }
    // try to initialize all requested metagame/variant combos to make sure they're valid
    try {
        const tried = new Set<string>();
        for (const pair of pars.pairs) {
            const id = [pair.metagame, ...pair.variants].join("|");
            if (tried.has(id)) {
                continue;
            } else {
                tried.add(id);
            }
            const info = gameinfo.get(pair.metagame);
            let engine;
            if (info.playercounts.length > 1)
              engine = GameFactory(pair.metagame, 2, pair.variants);
            else
              engine = GameFactory(pair.metagame, undefined, pair.variants);
            if (!engine) {
                console.log(`Error 400: No engine`);
                return {
                    statusCode: 400,
                    body: `The game engine could not be initialized for the game ${pair.metagame} and the variants "${pair.variants.join(", ")}".`,
                    headers
                };
            }
            const varsReqd = [...pair.variants];
            varsReqd.sort((a,b) => a.localeCompare(b));
            const varsEngine = [...engine.variants];
            varsEngine.sort((a,b) => a.localeCompare(b));
            if (varsReqd.join("|") !== varsEngine.join("|")) {
                console.log(`Error 400: Missing variants`);
                return {
                    statusCode: 400,
                    body: `The variants requested (${JSON.stringify(varsReqd)}) do not match the variants asserted by the game engine (${JSON.stringify(varsEngine)}).`,
                    headers
                };
            }
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Unable to validate metagame/variant combos for event ${pars.eventid}. Error: ${error}`);
    }

    const list: Promise<any>[] = [];
    try {
        // for each pairing
        const updatedGames = new Map<string, Game[]>();
        for (const pair of pars.pairs) {
            // create game record
            const gameId = uuid();
            const playerIDs = [pair.p1.id, pair.p2.id];
            let whoseTurn: string | boolean[] = "0";
            const info = gameinfo.get(pair.metagame);
            if (info.flags !== undefined && info.flags.includes('simultaneous')) {
              whoseTurn = playerIDs.map(() => true);
            }
            let engine: GameBase|GameBaseSimultaneous;
            if (info.playercounts.length > 1) {
                engine = GameFactory(pair.metagame, 2, pair.variants)!;
            } else {
                engine = GameFactory(pair.metagame, undefined, pair.variants)!;
            }
            const state = engine.serialize();
            const now = Date.now();
            const pInvolved = [players.find(p => p.id === pair.p1.id)!, players.find(p => p.id === pair.p2.id)!];
            // @ts-ignore
            if (pInvolved.includes(undefined)) {
                throw new Error("Could not find one of the players! This should never happen!");
            }
            const gamePlayers = pInvolved.map(p => { return {"id": p.id, "name": p.name, "time": pair.clockStart * 3600000 }}) as User[];
            if (info.flags !== undefined && info.flags.includes('perspective')) {
                let rot = 180;
                if (playerIDs.length > 2 && info.flags !== undefined && info.flags.includes('rotate90')) {
                  rot = -90;
                }
                for (let i = 1; i < playerIDs.length; i++) {
                  gamePlayers[i].settings = {"rotate": i * rot};
                }
            }
            // queue for update
            const addGame = sendCommandWithRetry(new PutCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Item: {
                    "pk": "GAME",
                    "sk": pair.metagame + "#0#" + gameId,
                    "id": gameId,
                    "metaGame": pair.metagame,
                    "numPlayers": 2,
                    "rated": true,
                    "players": gamePlayers,
                    "clockStart": pair.clockStart,
                    "clockInc": pair.clockInc,
                    "clockMax": pair.clockMax,
                    "clockHard": true,
                    "noExplore": false,
                    "state": state,
                    "toMove": whoseTurn,
                    "lastMoveTime": now,
                    "gameStarted": now,
                    "variants": engine.variants,
                    "event": pars.eventid,
                  } as FullGame
            }));
            list.push(addGame);
            // this should be all the info we want to show on the "my games" summary page.
            const game = {
                "id": gameId,
                "metaGame": pair.metagame,
                "players": pInvolved.map(p => {return {"id": p.id, "name": p.name, "time": pair.clockStart * 3600000}}),
                "clockHard": true,
                "noExplore": false,
                "toMove": whoseTurn,
                "lastMoveTime": now,
                "variants": engine.variants,
            } as Game;
            list.push(addToGameLists("CURRENTGAMES", game, now, false));
            // prepare to update player records and queue updates after the loop
            pInvolved.forEach(player => {
                let lst: Game[] = [];
                if (updatedGames.has(player.id)) {
                    lst = updatedGames.get(player.id)!;
                }
                lst.push(game);
                updatedGames.set(player.id, lst);
            });
            // Create an OrgEventGame record to link this game to the event
            const eventGame: OrgEventGame = {
                pk: "ORGEVENTGAME",
                sk: [pars.eventid, gameId].join("#"),
                metaGame: pair.metagame,
                variants: engine.variants,
                round: pair.round,
                gameid: gameId,
                player1: pair.p1.id,
                player2: pair.p2.id,
            };
            list.push(
                sendCommandWithRetry(new PutCommand({
                    TableName: process.env.ABSTRACT_PLAY_TABLE,
                      Item: eventGame,
                }))
            );
        }
        // queue all player updates one time
        players.forEach(player => {
            let games = player.games;
            if (games === undefined) {
                games = [];
            }
            const updated = updatedGames.get(player.id);
            if (updated !== undefined) {
                const updatedGameIDs: string[] = [];
                for (const game of updated) {
                    games.push(game);
                    updatedGameIDs.push(game.id);

                }
                list.push(updateUserGames(player.id, player.gamesUpdate, updatedGameIDs, games));
            }
        });
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventCreateGames: Something went wrong generating pairings for event ${pars.eventid}. Error: ${error}`);
    }
    // execute all updates
    try {
        await Promise.all(list);
        return {
            statusCode: 200,
            headers
        };
    } catch (error) {
        logGetItemError(error);
        throw new Error(`Something terrible happened while trying to create paired games for event ${pars.eventid}`);
    }
}

async function eventClose(userid: string, pars: {eventid: string, winner: string[]}) {
    // load event and authorize requester
    let userRec: FullUser|undefined;
    try {
        const user = await ddbDocClient.send(
        new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
            "pk": "USER",
            "sk": userid
            },
        }));
        if (user.Item === undefined || (user.Item.admin !== true && user.Item.organizer !== true)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
        userRec = user.Item as FullUser;
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`eventClose: Unable to load user record to authorize ${userid}`);
    }
    let event: OrgEvent;
    try {
        const eventRec = await ddbDocClient.send(
            new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                "pk": "ORGEVENT",
                "sk": pars.eventid
                },
        }));
        if (eventRec.Item === undefined) {
            console.log(`Error 404`);
            return {
                statusCode: 404,
                headers,
            };
        }
        event = eventRec.Item as OrgEvent;
        if (userRec === undefined || (userRec.admin !== true && event.organizer !== userid)) {
            console.log(`Error 401`);
            return {
                statusCode: 401,
                headers
            };
        }
    } catch (error) {
        logGetItemError(error);
        return formatReturnError(`eventClose: Unable to load/validate the event record for event ${pars.eventid}. Error: ${error}`);
    }
    // update event record
    try {
        if (event.dateEnd === undefined) {
            event.dateEnd = Date.now();
        }
        event.winner = pars.winner;
        await ddbDocClient.send(new PutCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
              Item: event
            })
        );
        return {
            statusCode: 200,
            headers
        };
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`eventClose: Unable to close event ${pars.eventid}`);
    }
}

async function eventUpdates(pars: {eventid: string, gameid: string, winner: string[]}): Promise<any[]> {
    const work: Promise<any>[] = [];
    work.push(
        ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "ORGEVENTGAME", "sk": `${pars.eventid}#${pars.gameid}` },
            ExpressionAttributeValues: { ":win": pars.winner, ":arb": false},
            UpdateExpression: "set winner = :win, arbitrated = :arb",
        }))
    );
    return Promise.all(work);
}

// Delete every trace of a list of games. Only for admins and probably only for dev!
async function deleteGames(userId: string, pars: { metaGame: string, cbit: number, gameids: string }) {
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
  const gameids = pars.gameids.split(",");
  const work: Promise<any>[] = [];
  const work2: Promise<any>[] = [];
  try {
    for (const gameid of gameids) {
      work.push(ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": pars.metaGame + "#" + pars.cbit + '#' + gameid.trim()
          },
        })
      ));
      work2.push(ddbDocClient.send(
        new QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "GAMEEXPLORATION#" + gameid },
            ExpressionAttributeNames: { "#pk": "pk" },
        })));
      if (pars.cbit === 1) {
        work2.push(ddbDocClient.send(
          new QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "PUBLICEXPLORATION#" + gameid },
            ExpressionAttributeNames: { "#pk": "pk" },
          })));
      }
    }
    const gamesData = await Promise.all(work);
    work.length = 0;
    const games = gamesData.map(g => g.Item as FullGame);
    // players to update
    const playersGameIDs = new Map<string, string[]>();
    for (const game of games) {
      for (const player of game.players) {
        if (!playersGameIDs.has(player.id))
        playersGameIDs.set(player.id, []);
        playersGameIDs.get(player.id)!.push(game.id);
      }
    }
    const playersFull = await getPlayers([...playersGameIDs.keys()]);
    for (const player of playersFull) {
      const gameIDs = playersGameIDs.get(player.id)!;
      const games = player.games.filter(g => !gameIDs.includes(g.id));
      work.push(updateUserGames(player.id, player.gamesUpdate, gameIDs, games));
    }
    // delete games
    for (const game of games) {
      work.push(ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAME",
            "sk": pars.metaGame + "#" + pars.cbit + '#' + game.id
          },
        })
      ));
      // delete from lists
      if (pars.cbit === 0)
        work.push(deleteFromGameLists("CURRENTGAMES", game));
      else
        work.push(deleteFromGameLists("COMPLETEDGAMES", game));
      // delete NOTES
      for (const player of game.players) {
        work.push(ddbDocClient.send(
          new DeleteCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "NOTE",
              "sk": game.id + '#' + player.id
            },
          })
        ));
      }
      // and COMMENTS
      work.push(ddbDocClient.send(
        new DeleteCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "GAMECOMMENTS",
            "sk": game.id
          },
        })
      ));
    }
    // delete game explorations
    const gameExplorationsData = await Promise.all(work2);
    const gameExplorations = gameExplorationsData.map(g => g.Items).flat();
    console.log("gameExplorations", gameExplorations);
    if (gameExplorations !== undefined) {
      const batches = Math.ceil(gameExplorations.length / 25);
      for (let batch = 0; batch < batches; batch++) {
        const subset = gameExplorations.slice(batch * 25, 25);
        work.push(ddbDocClient.send(
          new BatchWriteCommand({
            "RequestItems": {
              [process.env.ABSTRACT_PLAY_TABLE!]: subset.map(item => ({
                DeleteRequest: {
                  Key: {
                    pk: item.pk,
                    sk: item.sk,
                  }
                }
              }))
            }
          })
        ));
      }
    }
    await Promise.all(work);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Done"
      }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to delete games ${pars.gameids}. Error: ${error}`);
  }
}

async function reportProblem(pars: { error: string })
{
  console.log("Reported problem:", pars.error);
  const data = await ddbDocClient.send(
    new QueryCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeValues: { ":pk": "USERS" },
      ExpressionAttributeNames: { "#pk": "pk", "#name": "name"},
      ProjectionExpression: "sk, #name, lastSeen, country, stars",
      ReturnConsumedCapacity: "INDEXES"
    }));
  const users = data.Items;
  const playerIDs = [];
  for (const user of users!)
    if (user.name === 'fritzd' || user.name === 'Fritz Deelman' || user.name === 'Perlkönig')
      playerIDs.push(user.sk);
  const errorAdmins = await getPlayers(playerIDs);
  const addresses = [];
  for (const admin of errorAdmins) {
    if (admin.email !== undefined && admin.email !== null && admin.email !== "")
      addresses.push(admin.email);
  }
  const email = new SendEmailCommand({
    Destination: {
      ToAddresses: addresses
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: pars.error
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `AbstractPlay front end error report${process.env.ABSTRACT_PLAY_TABLE?.includes('-dev') ? ' (dev server)' : ''}`
      },
    },
    Source: "abstractplay@mail.abstractplay.com"
  });
  try {
    await sesClient.send(email);
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to send e-mail to error admins. Error: ${error}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Reported"
    }),
    headers
  };
}

async function sendPush(opts: PushOptions) {
    console.log(`Sending push: ${JSON.stringify(opts)}`);
    const {userId, body, title, topic, url} = opts;
    let subscription: PushCredentials|undefined;
    try {
      const push = await ddbDocClient.send(
          new GetCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: {
              "pk": "PUSH",
              "sk": userId
            },
          })
      );
      if (push.Item !== undefined) {
          subscription = push.Item as PushCredentials;
      }
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to fetch push credentials for ${userId}`);
    }

    if(subscription !== undefined) {
      // treat both 410 and 404 as permanent. There are a LOT of 404 web push errors in the logs and apparently these are because since June 2024 the Chrome/FCM push service has changed the way it reports stale or deleted web‑push registrations.
      const PERMANENT_FAILURES = new Set([404, 410]);

      try {
          const options: RequestOptions = {
            vapidDetails: {
              subject: 'https://play.abstractplay.com',
              publicKey: process.env.VAPID_PUBLIC_KEY as string,
              privateKey: process.env.VAPID_PRIVATE_KEY as string,
            },
            // @ts-ignore
            topic,
          };
          const payload = {title, body, url, topic};
          const result = await webpush.sendNotification(subscription.payload, JSON.stringify(payload), options);
          console.log(`Result of webpush:`);
          console.log(result);
      } catch (err: any) {
          if ( ("statusCode" in err) && PERMANENT_FAILURES.has(err.statusCode)) {
            await ddbDocClient.send(
                new DeleteCommand({
                  TableName: process.env.ABSTRACT_PLAY_TABLE,
                  Key: {
                    "pk": "PUSH",
                    "sk": userId
                  },
                })
            );
          } else {
            logGetItemError(err);
          }
          return formatReturnError(`Unable to send push notification: ${err}`);
      }
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
      if ( ("pieInvoked" in game) && (game.pieInvoked === true) ) {
        console.log("Double pie detected! Aborting!");
        return {
            statusCode: 200,
            body: JSON.stringify(game),
            headers
        };
      } else {
        const engine = GameFactory(game.metaGame, game.state);
        if (!engine)
          throw new Error(`Unknown metaGame ${game.metaGame}`);
        const flags = gameinfo.get(game.metaGame).flags;
        if ( (flags === undefined) || ( (! flags.includes("pie")) && (! flags.includes("pie-even")) ) ) {
          throw new Error(`Metagame ${pars.metaGame} does not have the "pie" flag. Aborting.`);
        }
        const lastMoveTime = (new Date(engine.stack[engine.stack.length - 1]._timestamp)).getTime();

        const player = game.players.find(p => p.id === userid);
        if (!player)
          throw new Error(`Player ${userid} isn't playing in game ${pars.id}`)

        const timestamp = Date.now();
        const timeUsed = timestamp - lastMoveTime;
        // console.log("timeUsed", timeUsed);
        // console.log("player", player);
        if (player.time! - timeUsed < 0)
          player.time = game.clockInc * 3600000; // If the opponent didn't claim a timeout win, and player moved, pretend his remaining time was zero.
        else
          player.time = player.time! - timeUsed + game.clockInc * 3600000;
        if (player.time > game.clockMax  * 3600000) player.time = game.clockMax * 3600000;
        const playerIDs = game.players.map((p: { id: any; }) => p.id);
        // TODO: We are updating players and their games. This should be put in some kind of critical section!
        const players = await getPlayers(playerIDs);
        console.log(`Current player list: ${JSON.stringify(game.players)}`);
        const reversed = [...game.players].reverse();
        console.log(`Reversed: ${JSON.stringify(reversed)}`);
        game.players = [...reversed];
        game.pieInvoked = true;

        // if flag is `pie-even`, issue a "pass" command
        if (flags.includes("pie-even")) {
          try {
              engine.move("pass")
              game.state = engine.serialize();
              game.numMoves = engine.state().stack.length - 1; // stack has an entry for the board before any moves are made
              game.toMove = `${engine.currplayer! - 1}`;
          } catch (err) {
              logGetItemError(err);
              return formatReturnError('Error passing while invoking "pie-even"');
          }
        } else {
            // the other player needs to be given `timeUsed` back on their clock to account
            // for the fact that the game state is not changing (`lastMoveTime` isn't going
            // to change)
            const otherPlayer = game.players.find(p => p.id !== userid)!;
            otherPlayer.time = otherPlayer.time! + timeUsed;
        }

        // this should be all the info we want to show on the "my games" summary page.
        const playerGame = {
          "id": game.id,
          "metaGame": game.metaGame,
          // reverse the list of players
          "players": [...reversed],
          "clockHard": game.clockHard,
          "noExplore": game.noExplore || false,
          "toMove": game.toMove,
          "lastMoveTime": timestamp
        } as Game;
        const myGame = {
          "id": game.id,
          "metaGame": game.metaGame,
          // reverse the list of players
          "players": [...reversed],
          "clockHard": game.clockHard,
          "noExplore": game.noExplore || false,
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
          list.push(updateUserGames(player.id, player.gamesUpdate, [playerGame.id], games));
          console.log(`Scheduled update to player ${player.id}, ${player.name}, with games`, games);
        });

        // insert a comment into the game log
        list.push(submitComment("", {id: game.id, comment: "Pie invoked.", moveNumber: 2}));

        list.push(sendSubmittedMoveEmails(game, players, false, []));
        console.log("Scheduled emails");
        await Promise.all(list);
        console.log("All updates complete");
        // if bot is involved, trigger ping
        if (players.map(p => p.id).includes(process.env.AIAI_USERID!)) {
          await realPingBot(pars.metaGame, pars.id);
        }
        return {
          statusCode: 200,
          body: JSON.stringify(game),
          headers
        };
      }
    }
    catch (error) {
      logGetItemError(error);
      return formatReturnError('Unable to process invoke pie');
    }
}

async function updateNote(userId: string, pars: {gameId: string; note?: string;}) {
    // if note is empty, delete the record
    if ( (pars.note === undefined) || (pars.note === null) || (pars.note.length === 0) ) {
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

async function updateCommented(userId: string, pars: {id: string; metaGame: string; cbit: number; commented: number;}) {
    console.log(`Updating commented flag for game ${pars.id} to ${pars.commented}`);
    try {
        // Directly update the commented flag without checking if game exists
        // This is a non-critical flag, so we can save the DB lookup
        await ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { 
                "pk": "GAME", 
                "sk": pars.metaGame + "#" + pars.cbit + "#" + pars.id 
            },
            ExpressionAttributeValues: { ":c": pars.commented },
            UpdateExpression: "set commented = :c",
        }));
        
        console.log(`Successfully updated commented flag for game ${pars.id} to ${pars.commented}`);
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
        return formatReturnError(`Unable to setLastSeen ${userId}`);
    }
    if (user !== undefined) {
        // find matching game
        const game = user.games.find(g => g.id === pars.gameId);
        if (game !== undefined) {
            // set lastSeen to "now" + interval
            let interval = 8;
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

async function botManageChallenges() {
    const userId = process.env.AIAI_USERID;
    try {
      console.log(`Getting USER record`);
      const userData = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "USER",
            "sk": userId
          },
        }));
      if (userData.Item === undefined) {
        throw new Error("Could not find a USER record for the AiAi bot");
      }
      const user = userData.Item as FullUser;
      let games = user.games;
      if (games === undefined)
        games= [];

      console.log(`Fetching challenges`);
      const challengesReceivedIDs: string[] = Array.from(user?.challenges_received ?? new Set());
      const data = await getChallenges(challengesReceivedIDs);
      const challengesReceived = data.map(r => r.Item as FullChallenge);
      console.log(`Got the following challenges:\n${JSON.stringify(challengesReceived, null, 2)}`);

      // process each challenge and accept/reject as appropriate
      for (const challenge of challengesReceived) {
        let accepted = false;
        // the overall meta must be supported
        const info = gameinfo.get(challenge.metaGame);
        if (info?.flags.includes("aiai")) {
          accepted = true;
        }
        // add any variant exceptions here too
        if (challenge.metaGame === "tumbleweed") {
          if (challenge.variants.includes("free-neutral") || challenge.variants.includes("capture-delay")) {
            accepted = false;
          }
        }

        // accept/reject challenge
        console.log(`About to ${accepted ? "accept" : "deny"} challenge ${challenge.sk}`)
        await respondedChallenge(process.env.AIAI_USERID!, {response: accepted, id: challenge.sk!, standing: challenge.standing, metaGame: challenge.metaGame, comment: "Let's play!"});
      }
    } catch (err) {
      logGetItemError(err);
      return formatReturnError(`Unable to manage bot challenges: ${err}`);
    }

    // now get list of games where it's your turn and make moves
    // have to refetch, sadly!
    // but check for bot's turn early to avoid unnecessary refetches
    try {
      console.log(`Getting USER record`);
      const userData = await ddbDocClient.send(
        new GetCommand({
          TableName: process.env.ABSTRACT_PLAY_TABLE,
          Key: {
            "pk": "USER",
            "sk": userId
          },
        }));
      if (userData.Item === undefined) {
        throw new Error("Could not find a USER record for the AiAi bot");
      }
      const user = userData.Item as FullUser;
      let games: Game[] = user.games;
      if (games === undefined)
        games= [];

      for (const game of games) {
        const info = gameinfo.get(game.metaGame);
        if (game.toMove !== null && game.toMove !== "") {
          const ids: string[] = [];
          if (info.flags.includes("simultaneous")) {
            const toMove = game.toMove as boolean[];
            if (toMove) {
              for (let i = 0; i < toMove.length; i++) {
                if (toMove[i]) {
                    ids.push(game.players[i].id);
                }
              }
            }
          } else {
            ids.push(game.players[parseInt(game.toMove as string, 10)].id);
          }
          if (ids.includes(process.env.AIAI_USERID!)) {
            await realPingBot(game.metaGame, game.id);
          }
        }
      }
    } catch (err) {
        logGetItemError(err);
        return formatReturnError(`Unable to manage bot challenges: ${err}`);
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

  let totalUnits = 0;
  // get all USER records
  let data: any;
  let users: FullUser[] = [];
  try {
    data = await ddbDocClient.send(
        new QueryCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            KeyConditionExpression: "#pk = :pk",
            ExpressionAttributeValues: { ":pk": "USER" },
            ExpressionAttributeNames: { "#pk": "pk" },
            ReturnConsumedCapacity: "INDEXES",
        })
      )
      if ( (data !== undefined) && ("ConsumedCapacity" in data) && (data.ConsumedCapacity !== undefined) && ("CapacityUnits" in data.ConsumedCapacity) && (data.ConsumedCapacity.CapacityUnits !== undefined) ) {
        totalUnits += data.ConsumedCapacity.CapacityUnits;
      } else {
        console.log(`Could not add consumed capacity: ${JSON.stringify(data?.ConsumedCapacity)}`);
      }
      users = data?.Items as FullUser[];
      console.log(JSON.stringify(users, null, 2));
      console.log(`Total units used: ${totalUnits}`);
  } catch (err) {
    logGetItemError(err);
    return formatReturnError(`Unable to onetimeFix get all users`);
  }

  const work: Promise<any>[] = [];
  for (const user of users) {
    work.push(
        ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "USERS", "sk": user.id },
            ExpressionAttributeValues: { ":ss": user.stars || [], ":ls": user.lastSeen || 0, ":country": user.country },
            UpdateExpression: "set stars = :ss, lastSeen = :ls, country = :country",
        }))
    );
  }
  return Promise.all(work);
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

async function testPush(userId: string) {
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
        return formatReturnError(`Unable to testPush ${userId}`);
  }

  await sendPush({
    userId,
    title: "Test",
    body: "Testing 1...2...3...",
    topic: "test",
    url: "/about",
  });
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

async function pingBot(userId: string, pars: {metaGame: string, gameid: string}) {
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
          return formatReturnError(`Unable to testPush ${userId}`);
    }

    await realPingBot(pars.metaGame, pars.gameid);

    return {
        statusCode: 200,
        body: JSON.stringify({}),
        headers
    };
}

async function realPingBot(metaGame: string, gameid: string, game?: FullGame) {
    // fetch game record and state
    if (game === undefined) {
        try {
            const data = await ddbDocClient.send(
              new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: {
                  "pk": "GAME",
                  "sk": metaGame + "#0#" + gameid
                },
              }));
            if (!data.Item)
              throw new Error(`No game ${metaGame + "#0#" + gameid} found in table ${process.env.ABSTRACT_PLAY_TABLE}`);
            game = data.Item as FullGame;
        }
        catch (error) {
            logGetItemError(error);
            return formatReturnError(`Unable to load game ${gameid} to make a bot move`);
        }
    }

    // instantiate game object
    if (game === undefined) {
        throw new Error("Unable to load game object");
    }
    const engine = GameFactory(metaGame, game.state);
    if (!engine)
      throw new Error(`Unknown metaGame ${metaGame}`);
    const info = gameinfo.get(metaGame);

    // notify AiAi bot, if necessary
    // get list of userIDs whose turn it is
    if (! engine.gameover) {
        const ids: string[] = [];
        if (info.flags.includes("simultaneous")) {
            for (let i = 0; i < (game.toMove as boolean[]).length; i++) {
                if (game.toMove[i]) {
                    ids.push(game.players[i].id);
                }
            }
        } else {
            ids.push(game.players[parseInt(game.toMove as string, 10)].id);
        }
        if (ids.includes(process.env.AIAI_USERID!)) {
            // construct message
            const body = {
                meta: metaGame,
                mgl: engine.aiaiMgl(),
                gameid: gameid,
                history: engine.state2aiai(),
            }
            const input: SendMessageRequest = {
                QueueUrl: process.env.SQS_URL,
                MessageBody: JSON.stringify(body),
            }
            const cmd = new SendMessageCommand(input);
            await sqsClient.send(cmd);
        }
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
    console.error('Full error object:', err);
    console.error('Stack trace:', new Error().stack);
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

async function *queryItemsGenerator(queryInput: QueryCommandInput): AsyncGenerator<unknown> {
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

// Make sure to increase the lamda timeout (from 6s) when you want to process all users. Just getting all users already takes about 2s.
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

