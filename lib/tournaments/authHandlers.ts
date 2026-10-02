/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type QueryCommandOutput,
  type UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { sesClient } from '../api/clients.js';
import {
  headers,
  formatReturnError,
  logGetItemError,
  handleCommonErrors,
} from '../api/http.js';
import {
  changeLanguageForPlayer,
  createSendEmailCommand,
  initi18n,
} from '../api/i18n.js';
import i18n from '../i18nInstance.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import { localizedGameName } from '../gameDisplayName.js';
import type { User } from '../api/types.js';
import { validateChallengeVariantUids } from '../challenges/variantUids.js';
import { tournamentPlaySupported } from '../tournamentGame.js';
import {
  parseMatchLegsParam,
  tournamentSeriesCounterSk,
  validateMatchLegsParam,
} from './matchLegs.js';
import { getPlayers } from '../players/getPlayers.js';
import { createNotification } from '../notifications.js';
import { sendUserPush } from '../push/sendUserPush.js';
import {
  applyDivisionTiebreaks,
  computeDivisionStandings,
  type DivisionStandingsResult,
} from './divisionStandings.js';
import {
  buildTournamentEndEmailBody,
  buildTournamentEndPushBody,
  computeEarliestNextTournamentStartMs,
  daysUntilFromNow,
} from './tournamentEndMessage.js';

type Division = {
  numGames: number;
  numCompleted: number;
  processed: boolean;
  winnerid?: string;
  winner?: string;
};

export type Tournament = {
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
  /** 1 = single game per pairing (default); 2 = second leg after each leg-1 game ends */
  matchLegs?: 1 | 2;
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

export async function newTournament(
  userid: string,
  pars: { metaGame: string, variants: string[], matchLegs?: 1 | 2 },
) {
  const matchLegsErr = validateMatchLegsParam(pars.matchLegs);
  if (matchLegsErr !== undefined) {
    return formatReturnError(matchLegsErr);
  }
  const variantErr = validateChallengeVariantUids(pars.metaGame, pars.variants);
  if (variantErr) {
    return variantErr;
  }
  if (!tournamentPlaySupported(pars.metaGame)) {
    return formatReturnError(`Game ${pars.metaGame} does not support automated tournaments (requires playercount 2)`);
  }
  const variantsKey = pars.variants.sort().join("|");
  const sk = tournamentSeriesCounterSk(pars.metaGame, pars.variants, pars.matchLegs);
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
      ExpressionAttributeNames: { "#count": "count", "#over": "over" },
      ConditionExpression: "attribute_not_exists(#count) OR #count = :val",
      UpdateExpression: "set #count = if_not_exists(#count, :zero) + :inc, #over = :f"
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Failed to update TOURNAMENTSCOUNTER, probably someone else beat us to it. So no harm done.
      console.log(`Failed to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
      return;
    }
    handleCommonErrors(err as { code: any; message: any });
    console.log(err);
    return formatReturnError(`Unable to update TOURNAMENTSCOUNTER for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  // Insert tournament
  const tournamentid = uuid();
  const matchLegs = parseMatchLegsParam(pars.matchLegs);
  const data: Tournament = {
    "pk": "TOURNAMENT",
    "sk": tournamentid,
    "id": tournamentid,
    "metaGame": pars.metaGame,
    "variants": pars.variants,
    "number": tournamentN + 1,
    "started": false,
    "dateCreated": Date.now(),
    "datePreviousEnded": 0,
    ...(matchLegs === 2 ? { matchLegs: 2 as const } : {}),
  };
  try {
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Item: data
    }));
  } catch (err) {
    handleCommonErrors(err as { code: any; message: any });
    return formatReturnError(`Unable to insert tournament for '${pars.metaGame}#${variantsKey}', count ${tournamentN} + 1`);
  }
  const ret = await joinTournament(userid, { tournamentid: tournamentid });
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

export async function joinTournament(userid: string, pars: { tournamentid: string, once?: boolean }) {
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
  if (!tournamentPlaySupported(tournament.metaGame)) {
    return formatReturnError(`Game ${tournament.metaGame} does not support automated tournaments (requires playercount 2)`);
  }
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

async function cancelSignupTournament(tournament: Tournament) {
  console.log(`Deleting tournament ${tournament.id}`);
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        "pk": "TOURNAMENT",
        "sk": tournament.id
      },
    }));
  const sk = tournamentSeriesCounterSk(
    tournament.metaGame,
    tournament.variants,
    tournament.matchLegs,
  );
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: { "pk": "TOURNAMENTSCOUNTER", "sk": sk },
      ExpressionAttributeValues: { ":t": true },
      ExpressionAttributeNames: { "#o": "over" },
      UpdateExpression: "set #o = :t"
    }));
}

export async function withdrawTournament(userid: string, pars: { tournamentid: string }) {
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


export async function endATournament(userId: string, pars: { tournamentid: string }) {
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

function tournamentDivisionNumber(player: TournamentPlayer): number | undefined {
  if (player.division !== undefined) {
    return player.division;
  }
  const parts = player.sk.split('#');
  if (parts.length >= 2) {
    const division = Number(parts[1]);
    if (Number.isFinite(division) && division > 0) {
      return division;
    }
  }
  return undefined;
}

function tournamentDivisionWinnerName(
  tournament: Tournament,
  divisionNumber: number | undefined,
): string | undefined {
  if (divisionNumber === undefined || tournament.divisions === undefined) {
    return undefined;
  }
  return tournament.divisions[divisionNumber]?.winner;
}

async function loadDivisionStandingsIntoCache(
  tournament: Tournament,
  divisionStandingsByNumber: Map<string, DivisionStandingsResult>,
): Promise<void> {
  if (tournament.divisions === undefined) {
    return;
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  for (const [divisionNumber, division] of Object.entries(tournament.divisions)) {
    if (!division.processed || divisionStandingsByNumber.has(divisionNumber)) {
      continue;
    }
    const [gamesData, playersData] = await Promise.all([
      sendCommandWithRetry<QueryCommandOutput>(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
          ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + '#' + divisionNumber + '#' },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        })),
      sendCommandWithRetry<QueryCommandOutput>(
        new QueryCommand({
          TableName: tableName,
          ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + '#' + divisionNumber + '#' },
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
        })),
    ]);
    const gamelist = gamesData.Items as TournamentGame[];
    const players = playersData.Items as TournamentPlayer[];
    divisionStandingsByNumber.set(
      divisionNumber,
      computeDivisionStandings(
        gamelist.map((game) => ({
          player1: game.player1,
          player2: game.player2,
          winner: game.winner,
        })),
        players.map((player) => ({
          playerid: player.playerid,
          playername: player.playername,
          rating: player.rating,
        })),
      ),
    );
  }
}

export async function endTournament(tournament: Tournament) {
  try {
    if (tournament.divisions) {
      const work: Promise<any>[] = [];
      let alldone = true;
      let tournamentUpdated = false;
      const divisionStandingsByNumber = new Map<string, DivisionStandingsResult>();
      for (const [divisionNumber, division] of Object.entries(tournament.divisions)) {
        if (division.numCompleted < division.numGames) {
          alldone = false;
        }
        if (division.numCompleted === division.numGames && !division.processed) {
          // Get games
          const work2: Promise<QueryCommandOutput>[] = [];
          work2.push(sendCommandWithRetry<QueryCommandOutput>(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
              ExpressionAttributeValues: { ":pk": "TOURNAMENTGAME", ":sk": tournament.id + '#' + divisionNumber + '#' },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
            })));
          // And players (we need the ratings at the start of the tournament)
          work2.push(sendCommandWithRetry<QueryCommandOutput>(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id + '#' + divisionNumber + '#' },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            })));
          const [gamesData, playersData] = await Promise.all(work2);
          const gamelist = gamesData.Items as TournamentGame[];
          const players = playersData.Items as TournamentPlayer[];
          const standingsResult = computeDivisionStandings(
            gamelist.map((game) => ({
              player1: game.player1,
              player2: game.player2,
              winner: game.winner,
            })),
            players.map((player) => ({
              playerid: player.playerid,
              playername: player.playername,
              rating: player.rating,
            })),
          );
          applyDivisionTiebreaks(players, standingsResult);
          divisionStandingsByNumber.set(divisionNumber, standingsResult);
          division.processed = true;
          division.winnerid = standingsResult.winnerId;
          division.winner = standingsResult.winnerName;
          // Update tournament players
          for (const player of players) {
            work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              Key: { "pk": "TOURNAMENTPLAYER", "sk": `${tournament.id}#${divisionNumber}#${player.playerid}` },
              ExpressionAttributeNames: { "#t": "tiebreak" },
              ExpressionAttributeValues: { ":t": player.tiebreak },
              UpdateExpression: "set #t = :t"
            })));
            if (player.timeout) {
              work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
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
          work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions },
            UpdateExpression: "set divisions = :ds",
          })));
        } else {
          const now = Date.now();
          await loadDivisionStandingsIntoCache(tournament, divisionStandingsByNumber);
          work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.id },
            ExpressionAttributeValues: { ":ds": tournament.divisions, ":dt": now },
            UpdateExpression: "set divisions = :ds, dateEnded = :dt",
          })));
          // Start the clock for next tournament start
          work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "TOURNAMENT", "sk": tournament.nextid },
            ExpressionAttributeValues: { ":dt": now },
            UpdateExpression: "set datePreviousEnded = :dt",
          })));
          // Send e-mails to participants
          // Now we need ALL players, not just the ones in the current division
          const playersData = await sendCommandWithRetry<QueryCommandOutput>(
            new QueryCommand({
              TableName: process.env.ABSTRACT_PLAY_TABLE,
              ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.id },
              ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
              KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
            }));
          const players = playersData.Items as TournamentPlayer[];
          const playersById = new Map(players.map(p => [p.playerid, p]));
          let nextSignupByPlayerId: Map<string, { daysUntilEarliestStart: number; signupCount: number; registeredForNext: boolean }> | undefined;
          if (tournament.nextid !== undefined) {
            const nextSignupPlayersData = await sendCommandWithRetry<QueryCommandOutput>(
              new QueryCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                ExpressionAttributeValues: { ":pk": "TOURNAMENTPLAYER", ":sk": tournament.nextid },
                ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
                KeyConditionExpression: "#pk = :pk and begins_with(#sk, :sk)",
              }));
            const nextSignupPlayers = (nextSignupPlayersData.Items ?? []) as TournamentPlayer[];
            const registeredIds = new Set(nextSignupPlayers.map((p) => p.playerid));
            const signupCount = nextSignupPlayers.length;
            const nextTournamentData = await sendCommandWithRetry(
              new GetCommand({
                TableName: process.env.ABSTRACT_PLAY_TABLE,
                Key: { pk: "TOURNAMENT", sk: tournament.nextid },
              }),
            );
            const nextTournament = nextTournamentData.Item as Tournament | undefined;
            if (nextTournament !== undefined) {
              const earliestStart = computeEarliestNextTournamentStartMs(
                nextTournament.dateCreated,
                now,
              );
              const daysUntilEarliestStart = daysUntilFromNow(earliestStart, now);
              nextSignupByPlayerId = new Map();
              for (const playerId of players.map((p) => p.playerid)) {
                nextSignupByPlayerId.set(playerId, {
                  daysUntilEarliestStart,
                  signupCount,
                  registeredForNext: registeredIds.has(playerId),
                });
              }
            }
          }
          // And, in fact, full players (just for e-mail!? and language... Don't want to put these in the tournament player because then those will have to be maintained if e-mail or language changes)
          const playersFull = await getPlayers(players.map(p => p.playerid));
          await initi18n('en');
          const tableName = process.env.ABSTRACT_PLAY_TABLE!;
          const variants = tournament.variants ?? [];
          for (const player of playersFull) {
            const tournamentPlayer = playersById.get(player.id);
            const divisionNumber = tournamentPlayer
              ? tournamentDivisionNumber(tournamentPlayer)
              : undefined;
            const winnerName = tournamentDivisionWinnerName(tournament, divisionNumber);
            const standings = divisionNumber !== undefined
              ? divisionStandingsByNumber.get(String(divisionNumber))
              : undefined;
            work.push(createNotification(ddbDocClient, tableName, player.id, {
              type: 'tournamentEnd',
              tournamentId: tournament.id,
              metaGame: tournament.metaGame,
              number: tournament.number,
              variants,
              ...(winnerName ? { winnerName } : {}),
            }, {
              userSettings: player.settings,
            }));
            console.log(`Determining whether to send tournamentEnd email to the following player:\n${JSON.stringify(player)}`);
            // eslint-disable-next-line no-prototype-builtins
            if ((player.settings?.all?.notifications === undefined) || (!player.settings.all.notifications.hasOwnProperty("tournamentEnd")) || (player.settings.all.notifications.tournamentEnd)) {
              console.log("Sending email");
              await changeLanguageForPlayer(player);
              const metaGameName = localizedGameName(tournament.metaGame);
              const messageCtx = {
                metaGameName,
                number: tournament.number,
                tournamentId: tournament.id,
                variants,
                recipientUserId: player.id,
                standings,
                nextSignup: nextSignupByPlayerId?.get(player.id),
              };
              const emailBody = buildTournamentEndEmailBody(messageCtx);
              const pushBody = buildTournamentEndPushBody(messageCtx);
              if ((player.email !== undefined) && (player.email !== null) && (player.email !== "")) {
                const comm = createSendEmailCommand(player.email, player.name, i18n.t("TournamentEndSubject", { "metaGame": metaGameName, }), emailBody);
                work.push(sesClient.send(comm));
              }
              work.push(sendUserPush({
                userId: player.id,
                topic: "tournament",
                title: i18n.t("PUSH.titles.tournamentOver"),
                body: pushBody,
                url: `/tournament/${tournament.id}`,
              }));
            }
          }
        }
      }
      if (work.length > 0) {
        await Promise.all(work);
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
