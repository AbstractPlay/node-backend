import { describe, expect, it } from 'vitest';
import {
  buildTournamentGamePlayers,
  swappedTournamentPairingPlayers,
} from '@backend/lib/tournaments/createTournamentPairingGame.js';

describe('createTournamentPairingGame helpers', () => {
  it('swaps player order for leg 2', () => {
    const pair = [
      { id: 'alice', name: 'Alice', time: 1 },
      { id: 'bob', name: 'Bob', time: 2 },
    ] as [{ id: string; name: string; time: number }, { id: string; name: string; time: number }];
    const swapped = swappedTournamentPairingPlayers(pair);
    expect(swapped[0].id).toBe('bob');
    expect(swapped[1].id).toBe('alice');
  });

  it('buildTournamentGamePlayers preserves order', () => {
    const pair = [
      { id: 'a', name: 'A', time: 0 },
      { id: 'b', name: 'B', time: 0 },
    ] as [{ id: string; name: string; time: number }, { id: string; name: string; time: number }];
    const players = buildTournamentGamePlayers('Chess', pair);
    expect(players[0].id).toBe('a');
    expect(players[1].id).toBe('b');
  });
});
