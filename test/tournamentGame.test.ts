import { beforeAll, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { tournamentPlaySupported } from '../lib/tournamentGame.js';

let gameinfo: Awaited<typeof import('@abstractplay/gameslib')>['gameinfo'];

beforeAll(async () => {
  ({ gameinfo } = await import('@abstractplay/gameslib'));
});

describe('tournamentPlaySupported', () => {
  it('is false for unknown games', () => {
    assert.equal(tournamentPlaySupported('not-a-real-game-uid'), false);
  });

  it('is true when playercounts includes 2', () => {
    const withTwo = [...gameinfo.values()].find((g) => g.playercounts.includes(2));
    if (withTwo !== undefined) {
      assert.equal(tournamentPlaySupported(withTwo.uid), true);
    }
  });

  it('is false when playercounts is solo-only', () => {
    const soloOnly = [...gameinfo.values()].find(
      (g) => g.playercounts.length === 1 && g.playercounts[0] === 1,
    );
    if (soloOnly !== undefined) {
      assert.equal(tournamentPlaySupported(soloOnly.uid), false);
    }
  });
});
