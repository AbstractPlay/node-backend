import { UpdateCommand, type UpdateCommandOutput } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { sendCommandWithRetry } from '../api/ddbRetry.js';
import type { User } from '../api/types.js';
import { endTournament, type Tournament } from '../tournaments/authHandlers.js';
import { spawnTournamentLeg2IfNeeded } from '../tournaments/spawnTournamentLeg2.js';

export type TournamentFinishedGame = {
  id: string;
  metaGame: string;
  variants?: string[];
  tournament: string;
  division: number;
  winner?: number[];
  players: User[];
  matchLeg?: number;
  clockStart?: number;
  clockInc?: number;
  clockMax?: number;
};

/** True when any division has all games done but standings not yet processed. */
export function divisionReadyForFinalization(tournament: Tournament): boolean {
  if (tournament.divisions === undefined) {
    return false;
  }
  return Object.values(tournament.divisions).some(
    (division) => division.numCompleted === division.numGames && !division.processed,
  );
}

/**
 * After a tournament pairing game ends: scores, TOURNAMENTGAME winner, numCompleted,
 * optional leg-2 spawn, and endTournament when a division completes.
 */
export async function applyTournamentGameEndUpdates(
  game: TournamentFinishedGame,
  players: { id: string; name: string }[],
  timeoutPlayerIndex: number | undefined,
): Promise<void> {
  let work: Promise<unknown>[] = [];
  for (let i = 0; i < 2; i++) {
    const player = players[i];
    let score = 0;
    if (game.winner?.length === 1 && game.players[game.winner[0] - 1].id === player.id) {
      score = 1;
    } else if (game.winner?.length === 2) {
      score = 0.5;
    }
    work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
      TableName: process.env.ABSTRACT_PLAY_TABLE,
      Key: {
        pk: 'TOURNAMENTPLAYER',
        sk: `${game.tournament}#${game.division}#${player.id}`,
      },
      ExpressionAttributeNames: { '#s': 'score', '#t': 'timeout' },
      ExpressionAttributeValues: { ':inc': score, ':t': i === timeoutPlayerIndex },
      UpdateExpression: 'add #s :inc set #t = :t',
    })));
  }
  const winner = game.winner?.map((w: number) => game.players[w - 1].id);
  work.push(sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: {
      pk: 'TOURNAMENTGAME',
      sk: `${game.tournament}#${game.division}#${game.id}`,
    },
    ExpressionAttributeNames: { '#w': 'winner' },
    ExpressionAttributeValues: { ':w': winner },
    UpdateExpression: 'set #w = :w',
  })));
  const tournamentData = await sendCommandWithRetry<UpdateCommandOutput>(new UpdateCommand({
    TableName: process.env.ABSTRACT_PLAY_TABLE,
    Key: { pk: 'TOURNAMENT', sk: game.tournament },
    ExpressionAttributeNames: { '#d': 'divisions', '#n': game.division.toString() },
    ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
    UpdateExpression: 'set #d.#n.numCompleted = if_not_exists(#d.#n.numCompleted, :zero) + :inc',
    ReturnValues: 'ALL_NEW',
  }));
  const tournament = tournamentData.Attributes as Tournament;
  work.push(spawnTournamentLeg2IfNeeded(
    ddbDocClient,
    process.env.ABSTRACT_PLAY_TABLE!,
    {
      ...game,
      clockStart: game.clockStart ?? 0,
      clockInc: game.clockInc ?? 0,
      clockMax: game.clockMax ?? 0,
    },
    tournament,
  ));
  if (divisionReadyForFinalization(tournament)) {
    await Promise.all(work);
    await endTournament(tournament);
    return;
  }
  await Promise.all(work);
}
