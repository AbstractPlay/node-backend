import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { User } from '../api/types.js';
import { normalizeMatchLegs } from './matchLegs.js';
import type { Tournament } from './authHandlers.js';
import {
  createTournamentPairingGame,
  swappedTournamentPairingPlayers,
  type TournamentPairingPlayer,
} from './createTournamentPairingGame.js';
import { tournamentLeg2ExistsForPair } from './tournamentPairing.js';

type FinishedTournamentGame = {
  id: string;
  metaGame: string;
  variants?: string[];
  tournament?: string;
  division?: number;
  players: User[];
  matchLeg?: number;
  clockStart: number;
  clockInc: number;
  clockMax: number;
};

function pairingPlayersFromGame(game: FinishedTournamentGame): [TournamentPairingPlayer, TournamentPairingPlayer] {
  const clockMs = game.clockStart * 3_600_000;
  return [
    { id: game.players[0]!.id, name: game.players[0]!.name, time: clockMs },
    { id: game.players[1]!.id, name: game.players[1]!.name, time: clockMs },
  ];
}

/** Spawn leg 2 when a two-leg tournament's leg-1 game completes (idempotent). */
export async function spawnTournamentLeg2IfNeeded(
  client: DynamoDBDocumentClient,
  tableName: string,
  game: FinishedTournamentGame,
  tournament: Tournament,
): Promise<void> {
  if (game.tournament === undefined || game.division === undefined) {
    return;
  }
  if (normalizeMatchLegs(tournament.matchLegs) !== 2) {
    return;
  }
  const finishedLeg = game.matchLeg ?? 1;
  if (finishedLeg !== 1) {
    return;
  }

  const p1 = game.players[0]!.id;
  const p2 = game.players[1]!.id;
  const exists = await tournamentLeg2ExistsForPair(
    client,
    tableName,
    game.tournament,
    game.division,
    p1,
    p2,
  );
  if (exists) {
    return;
  }

  const leg1Players = pairingPlayersFromGame(game);
  const leg2Players = swappedTournamentPairingPlayers(leg1Players);

  await createTournamentPairingGame({
    client,
    tableName,
    tournamentId: game.tournament,
    metaGame: game.metaGame,
    variants: game.variants ?? tournament.variants ?? [],
    division: game.division,
    players: leg2Players,
    matchLeg: 2,
    schedulingRound: 1,
    rematchOf: game.id,
    clockStart: game.clockStart,
    clockInc: game.clockInc,
    clockMax: game.clockMax,
  });
}
