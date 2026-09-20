import type { Tournament } from 'types/index.js';
import type { GameRec } from 'types/GameRec.js';
import { normalizeMatchLegs } from '@backend/lib/tournaments/matchLegs.js';

export function tournamentRecordRound(gdata: GameRec, trec: Tournament): string {
  if (normalizeMatchLegs(trec.matchLegs) !== 2) {
    return '1';
  }
  const leg = gdata.matchLeg ?? 1;
  const sched = gdata.schedulingRound ?? 1;
  return `${sched.toString()}:${leg.toString()}`;
}
