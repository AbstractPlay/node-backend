import { tournamentSeriesCounterSk } from '../tournaments/matchLegs.js';

export function ladderSeriesSk(metaGame: string, variants: string[]): string {
  return tournamentSeriesCounterSk(metaGame, variants);
}

export function ladderPlayerSk(ladderId: string, userid: string): string {
  return `${ladderId}#${userid}`;
}

export function ladderGameSk(ladderId: string, gameId: string): string {
  return `${ladderId}#${gameId}`;
}

export function ladderByUserPk(userid: string): string {
  return `LADDERBYUSER#${userid}`;
}
