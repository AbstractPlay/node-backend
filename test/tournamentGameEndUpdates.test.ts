import { describe, expect, it } from 'vitest';
import { divisionReadyForFinalization } from '../lib/games/tournamentGameEndUpdates.js';
import type { Tournament } from '../lib/tournaments/authHandlers.js';

describe('divisionReadyForFinalization', () => {
  it('is true when a division finished all games but is not processed', () => {
    const tournament = {
      id: 't1',
      divisions: {
        1: { numGames: 6, numCompleted: 6, processed: false },
      },
    } as unknown as Tournament;
    expect(divisionReadyForFinalization(tournament)).toBe(true);
  });

  it('is false when games remain or division already processed', () => {
    const inProgress = {
      id: 't1',
      divisions: {
        1: { numGames: 6, numCompleted: 5, processed: false },
      },
    } as unknown as Tournament;
    const done = {
      id: 't1',
      divisions: {
        1: { numGames: 6, numCompleted: 6, processed: true },
      },
    } as unknown as Tournament;
    expect(divisionReadyForFinalization(inProgress)).toBe(false);
    expect(divisionReadyForFinalization(done)).toBe(false);
  });
});
