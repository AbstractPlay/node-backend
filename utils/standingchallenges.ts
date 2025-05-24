/* eslint-disable @typescript-eslint/ban-ts-comment */
'use strict';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
// import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { Handler } from "aws-lambda";

const REGION = "us-east-1";
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

// Types
type UserSettings = {
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

type User = {
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

type TagList = {
  meta: string;
  tags: string[];
}

type Palette = {
    name: string;
    colours: string[];
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

export const handler: Handler = async (event: any, context?: any) => {
  let recCount = 0;
  let entryCount = 0;
  let issued = 0;
  let errors = 0;
  try {
      // get all users' REALSTANDING records
      const recs = await getAllRecs();
      recCount = recs.length;
      // for each record (user)
      for (const rec of recs) {
        // get player profile
        const userrec = await ddbDocClient.send(
            new GetCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: {
                "pk": "USER",
                "sk": rec.sk,
              },
        }));
        if (userrec.Item === undefined) {
            errors++;
            console.log(`Could not load user record for ${rec.sk}`);
            continue;
        }
        const user = userrec.Item as FullUser;
        // for each challenge
        for (const entry of rec.standing) {
          entryCount++;
          if (entry.suspended) { continue; }
          let totalExisting = 0;
          // count number of metagame games and challenges
          let metaCount = 0;
          const matchingChallenges: string[] = [];
          if (user.challenges.standing !== undefined) {
            for (const challenge of user.challenges.standing) {
                if (challenge.startsWith(entry.metaGame)) {
                    metaCount++;
                    matchingChallenges.push(challenge);
                }
              }
          }
          const matchingGames: Game[] = [];
          if (user.games !== undefined && Array.isArray(user.games)) {
            for (const game of user.games) {
                if (game.metaGame === entry.metaGame && game.gameEnded === undefined) {
                    metaCount++;
                    matchingGames.push(game);
                }
              }
          }
          let hasMatchingChallenges = false;
          // if sensitivity is simply meta, just record the counts
          if (entry.sensitivity === "meta") {
            totalExisting = metaCount;
            hasMatchingChallenges = matchingChallenges.length > 0;
          }
          // otherwise, check variant combinations
          else {
            for (const challenge of matchingChallenges) {
                const [meta, id] = challenge.split("#");
                const pk = `STANDINGCHALLENGE#${meta}`;
                const sk = id;
                const challengeRec = await ddbDocClient.send(
                    new GetCommand({
                      TableName: process.env.ABSTRACT_PLAY_TABLE,
                      Key: {
                        pk,
                        sk,
                      },
                }));
                if (challengeRec.Item === undefined) {
                    errors++;
                    console.log(`Could not load challenge record for ${challenge}`);
                    continue;
                }
                const item = challengeRec.Item as FullChallenge;
                if (stringArraysEqual(item.variants, entry.variants || [])) {
                    totalExisting++;
                    hasMatchingChallenges = true;
                    break;
                }
            }
            if (!hasMatchingChallenges) {
                for (const game of matchingGames) {
                    if (stringArraysEqual(game.variants || [], entry.variants || [])) {
                        totalExisting;
                    }
                }
            }
          }

          // if there are matching open challenges, don't do anything
          if (hasMatchingChallenges) {
            continue;
          }

          // if count is below limit, issue new challenges
          if (totalExisting < entry.limit) {
            const challenge: FullChallenge = {
                metaGame: entry.metaGame,
                numPlayers: entry.numPlayers,
                standing: true,
                duration: 1,
                seating: "random",
                variants: entry.variants === undefined ? [] : [...entry.variants],
                challenger: {
                    id: rec.sk,
                    name: user.name,
                },
                players: [{
                    id: rec.sk,
                    name: user.name,
                }],
                clockStart: entry.clockStart,
                clockInc: entry.clockInc,
                clockMax: entry.clockMax,
                clockHard: entry.clockHard,
                rated: entry.rated,
                noExplore: entry.noExplore || false,
                comment: "Standing Challenge",
                dateIssued: Date.now(),
            };
            await newStandingChallenge(rec.sk, challenge);
            issued++;
          }
        }
      }
  }
  catch (error) {
    logGetItemError(error);
    console.log(`An error occurred processing standing challenges from table ${process.env.ABSTRACT_PLAY_TABLE}`);
    return;
  }
  console.log(`Processed standing challenge records for ${recCount} users with a total of ${entryCount} entries. ${issued} challenges were issued and ${errors} errors were encountered.`);
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
          "dateIssued": challenge.dateIssued,
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

    await Promise.all([addChallenge, updateChallenger, updateStandingChallengeCnt]);
    console.log("Successfully added challenge" + challengeId);
}

const getAllRecs = async (): Promise<StandingChallengeRec[]> => {
    const result: StandingChallengeRec[] = []
    const queryInput: QueryCommandInput = {
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: {
        '#pk': 'pk',
      },
      ExpressionAttributeValues: {
        ':pk': 'REALSTANDING',
      },
      TableName: process.env.ABSTRACT_PLAY_TABLE,
    }
    for await (const page of queryItemsGenerator(queryInput)) {
      result.push(...page as StandingChallengeRec[]);
    }
    return result;
}

const stringArraysEqual = (lst1: string[], lst2: string[]): boolean => {
    if (lst1.length === lst2.length) {
        const s1 = [...lst1].sort((a, b) => a.localeCompare(b));
        const s2 = [...lst2].sort((a, b) => a.localeCompare(b));
        let doesMatch = true;
        for (let i = 0; i < s1.length; i++) {
            if (s1[i] !== s2[i]) {
                doesMatch = false;
                break;
            }
        }
        if (doesMatch) {
            return true;
        }
    }
    return false;
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
