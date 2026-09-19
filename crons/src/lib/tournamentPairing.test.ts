import { describe, expect, it } from 'vitest';
import {
  canonicalPlayerPair,
  existingPairKeys,
  findExistingGameForPair,
  type ExistingTournamentGame,
} from './tournamentPairing.js';

describe('tournamentPairing resume helpers', () => {
  const games: ExistingTournamentGame[] = [
    { id: 'g1', division: 1, player1: 'alice', player2: 'bob', pairKey: 'alice#bob' },
    { id: 'g2', division: 1, player1: 'carol', player2: 'dave', pairKey: 'carol#dave' },
  ];

  it('builds a set of existing pair keys', () => {
    expect(existingPairKeys(games)).toEqual(new Set(['alice#bob', 'carol#dave']));
  });

  it('finds an existing game for a canonical pair', () => {
    expect(findExistingGameForPair(games, canonicalPlayerPair('bob', 'alice'))?.id).toBe('g1');
    expect(findExistingGameForPair(games, 'eve#frank')).toBeUndefined();
  });
});
