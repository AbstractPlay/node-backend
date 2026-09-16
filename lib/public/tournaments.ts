import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';

type Tournament = {
  id: string;
  metaGame: string;
  variants: string[];
  dateEnded?: number;
  pk?: string;
  sk?: string;
  players?: TournamentPlayer[];
};

type TournamentPlayer = { sk: string };
type TournamentGame = { id: string };

export async function archiveTournaments() {
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
      body: JSON.stringify({ message: "Archived old tournaments: " + list.join(", ") }),
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
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(players)',
      })).catch((error: { name?: string }) => {
        if (error.name === 'ConditionalCheckFailedException') {
          console.warn(
            `Skipping tournament ref update for missing game ${tournament.metaGame}#1#${tournamentGame.id}`,
          );
          return;
        }
        throw error;
      }));
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

export async function getTournaments() {
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
      body: JSON.stringify({ tournaments: tournamentsData.Items, tournamentPlayers: tournamentPlayersData.Items }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

export async function getOldTournaments(pars: { metaGame: string }) {
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
      body: JSON.stringify({ tournaments: tournamentsData.Items }),
      headers
    };
  }
  catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get tournaments from table ${process.env.ABSTRACT_PLAY_TABLE}`);
  }
}

export async function getTournament(pars: { tournamentid: string, metaGame: string, isArchived?: string, gameId?: string }) {
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
        try {
          await ddbDocClient.send(new UpdateCommand({
            TableName: process.env.ABSTRACT_PLAY_TABLE,
            Key: { "pk": "GAME", "sk": pars.metaGame + '#1#' + pars.gameId },
            ExpressionAttributeValues: { ":newTournamentRef": newTournamentRef },
            UpdateExpression: "set tournament = :newTournamentRef",
            ConditionExpression: 'attribute_exists(pk) AND attribute_exists(players)',
          }));
        } catch (error) {
          if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
            console.warn(
              `Skipping tournament ref fix for missing game ${pars.metaGame}#1#${pars.gameId}`,
            );
          } else {
            throw error;
          }
        }

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
