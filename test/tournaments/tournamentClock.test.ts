import { describe, expect, it } from 'vitest';
import {
  AUTOMATED_TOURNAMENT_CLOCK_MAX,
  AUTOMATED_TOURNAMENT_CLOCK_START,
  tournamentInitialBankMs,
} from '../../lib/tournaments/clock.js';
import { pairingPlayersFromGame } from '../../lib/tournaments/spawnTournamentLeg2.js';

describe('automated tournament clock', () => {
  it('starts new games at clockMax', () => {
    expect(AUTOMATED_TOURNAMENT_CLOCK_START).toBe(AUTOMATED_TOURNAMENT_CLOCK_MAX);
    expect(tournamentInitialBankMs()).toBe(AUTOMATED_TOURNAMENT_CLOCK_MAX * 3_600_000);
  });

  it('leg-2 pairing uses clockMax for initial bank when clockStart is lower', () => {
    const pair = pairingPlayersFromGame({
      id: 'g1',
      metaGame: 'abande',
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      clockStart: 72,
      clockInc: 36,
      clockMax: 120,
    });
    expect(pair[0].time).toBe(120 * 3_600_000);
    expect(pair[1].time).toBe(120 * 3_600_000);
  });
});
