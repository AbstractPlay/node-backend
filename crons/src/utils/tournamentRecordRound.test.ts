import { describe, expect, it } from 'vitest';
import type { Tournament } from 'types/index.js';
import type { GameRec } from 'types/GameRec.js';
import { tournamentRecordRound } from './tournamentRecordRound.js';

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    pk: 'TOURNAMENT',
    sk: 'tid',
    id: 'tid',
    metaGame: 'zola',
    variants: [],
    number: 1,
    started: true,
    dateCreated: 0,
    datePreviousEnded: 0,
    ...overrides,
  };
}

function makeGame(overrides: Partial<GameRec> = {}): GameRec {
  return {
    pk: 'GAME',
    sk: 'zola#0#g1',
    id: 'g1',
    metaGame: 'zola',
    state: '{}',
    players: [],
    ...overrides,
  };
}

describe('tournamentRecordRound', () => {
  it('returns 1 for single-leg tournaments', () => {
    expect(tournamentRecordRound(makeGame(), makeTournament())).toBe('1');
    expect(tournamentRecordRound(makeGame({ matchLeg: 2 }), makeTournament())).toBe('1');
  });

  it('returns schedulingRound:matchLeg for two-leg tournaments', () => {
    const twoLeg = makeTournament({ matchLegs: 2 });
    expect(tournamentRecordRound(makeGame(), twoLeg)).toBe('1:1');
    expect(tournamentRecordRound(makeGame({ matchLeg: 2 }), twoLeg)).toBe('1:2');
    expect(tournamentRecordRound(makeGame({ matchLeg: 2, schedulingRound: 1 }), twoLeg)).toBe('1:2');
  });
});
