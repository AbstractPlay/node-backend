import { describe, expect, it } from 'vitest';
import {
  canonicalPlayerPair,
  existingLeg1PairKeys,
  findExistingGameForPair,
  pairingResumeKey,
  type ExistingTournamentGame,
} from './tournamentPairing.js';

describe('tournamentPairing resume helpers', () => {
  const games: ExistingTournamentGame[] = [
    { id: 'g1', division: 1, player1: 'alice', player2: 'bob', pairKey: 'alice#bob', matchLeg: 1 },
    { id: 'g2', division: 1, player1: 'carol', player2: 'dave', pairKey: 'carol#dave', matchLeg: 1 },
    { id: 'g3', division: 1, player1: 'bob', player2: 'alice', pairKey: 'alice#bob', matchLeg: 2 },
  ];

  it('builds a set of existing leg-1 pair keys', () => {
    expect(existingLeg1PairKeys(games)).toEqual(new Set(['alice#bob', 'carol#dave']));
  });

  it('finds an existing game for a canonical pair and leg', () => {
    expect(findExistingGameForPair(games, canonicalPlayerPair('bob', 'alice'), 1)?.id).toBe('g1');
    expect(findExistingGameForPair(games, canonicalPlayerPair('bob', 'alice'), 2)?.id).toBe('g3');
    expect(findExistingGameForPair(games, 'eve#frank', 1)).toBeUndefined();
  });

  it('builds pairing resume keys', () => {
    expect(pairingResumeKey('alice#bob', 2)).toBe('alice#bob#2');
  });
});
