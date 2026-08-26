"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveChallengeSeed,
  soloPlaySupported,
  normalizeSoloClocks,
} = require('../lib/soloGame');
const { shouldKeepCompletedGame } = require('../lib/gameProjector');

describe('resolveChallengeSeed', () => {
  it('returns trimmed client seed when provided', () => {
    assert.equal(resolveChallengeSeed('  daily-abc  '), 'daily-abc');
  });

  it('generates a uuid when omitted', () => {
    const a = resolveChallengeSeed();
    const b = resolveChallengeSeed();
    assert.ok(a.length > 0);
    assert.notEqual(a, b);
  });
});

describe('soloPlaySupported', () => {
  it('is false for unknown games', () => {
    assert.equal(soloPlaySupported('not-a-real-game-uid'), false);
  });
});

describe('normalizeSoloClocks', () => {
  it('fills defaults', () => {
    const clocks = normalizeSoloClocks();
    assert.equal(clocks.clockStart, 72);
    assert.equal(clocks.clockHard, false);
  });
});

describe('shouldKeepCompletedGame solo', () => {
  const soloGame = {
    pk: 'GAME',
    sk: 'puzzle#1#g1',
    id: 'g1',
    metaGame: 'puzzle',
    numPlayers: 1,
    players: [],
    clockHard: false,
    toMove: '',
    lastMoveTime: 1,
    state: '{}',
  };

  it('keeps solo games with at least one move', () => {
    assert.equal(shouldKeepCompletedGame(soloGame, 1), true);
    assert.equal(shouldKeepCompletedGame(soloGame, 0), false);
  });
});
