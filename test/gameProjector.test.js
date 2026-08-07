"use strict";
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseGameSk,
  resolveNumMoves,
  shouldKeepCompletedGame,
  toCompletedSummary,
  toCurrentSummary,
} = require('../lib/gameProjector');

describe('parseGameSk', () => {
  it('parses metaGame#cbit#gameId', () => {
    assert.deepEqual(parseGameSk('saltire#0#abc-123'), {
      metaGame: 'saltire',
      cbit: '0',
      gameId: 'abc-123',
    });
  });

  it('returns null for invalid sk', () => {
    assert.equal(parseGameSk('saltire#0'), null);
    assert.equal(parseGameSk(''), null);
  });
});

describe('toCurrentSummary', () => {
  it('maps active game fields including numMoves', () => {
    const summary = toCurrentSummary({
      pk: 'GAME',
      sk: 'saltire#0#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [{ id: 'p1', name: 'A' }],
      clockHard: true,
      toMove: '0',
      lastMoveTime: 100,
      state: '{}',
      variants: ['v1'],
      gameStarted: 50,
      numMoves: 12,
    });
    assert.equal(summary.id, 'g1');
    assert.equal(summary.metaGame, 'saltire');
    assert.equal(summary.noExplore, false);
    assert.deepEqual(summary.variants, ['v1']);
    assert.equal(summary.numMoves, 12);
  });
});

describe('shouldKeepCompletedGame', () => {
  it('keeps games with more moves than players', () => {
    const game = {
      pk: 'GAME',
      sk: 'saltire#1#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [],
      clockHard: false,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
    };
    assert.equal(shouldKeepCompletedGame(game, 3), true);
    assert.equal(shouldKeepCompletedGame(game, 2), false);
  });
});

describe('toCompletedSummary', () => {
  it('includes numMoves and commented', () => {
    const summary = toCompletedSummary({
      pk: 'GAME',
      sk: 'saltire#1#g1',
      id: 'g1',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [{ id: 'p1', name: 'A' }],
      clockHard: false,
      toMove: '',
      lastMoveTime: 200,
      state: '{}',
      commented: 1,
      winner: [1],
    }, 5);
    assert.equal(summary.numMoves, 5);
    assert.equal(summary.commented, 1);
    assert.deepEqual(summary.winner, [1]);
  });
});

describe('resolveNumMoves', () => {
  it('uses numMoves when present', () => {
    assert.equal(resolveNumMoves({
      pk: 'GAME',
      sk: 'x#1#y',
      id: 'y',
      metaGame: 'saltire',
      numPlayers: 2,
      players: [],
      clockHard: false,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
      numMoves: 7,
    }), 7);
  });
});
