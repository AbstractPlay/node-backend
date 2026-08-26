"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { gameinfo } = require('@abstractplay/gameslib');
const { tournamentPlaySupported } = require('../lib/tournamentGame');

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
