import assert from 'node:assert/strict';
import { GameFactory, replacer, reviver } from '@abstractplay/gameslib';
import { patchChameleonTerminalEogReason } from '../../scripts/lib/chameleon-eog-backfill.mjs';

const g = GameFactory('chameleon');
if (g === undefined) {
  throw new Error('GameFactory(chameleon) unavailable');
}
g.board.clear();
g.board.set('c5', 'BW');
g.board.set('e5', 'BW');
g.board.set('b1', 'AB');
g.board.set('a2', 'AW');
g.board.set('c2', 'AW');
g.board.set('e4', 'BB');
g.board.set('e1', 'BB');
g.currplayer = 1;
g.gameover = true;
g.winner = [2];
g.stack = [{
  _version: '20250130',
  _results: [],
  _timestamp: new Date(),
  currplayer: 1,
  board: new Map(g.board),
}, {
  _version: '20250130',
  _results: [
    { type: 'move', from: 'b4', to: 'e1' },
    { type: 'capture', where: 'e1' },
    { type: 'eog', reason: 'annihilation' },
    { type: 'winners', players: [2] },
  ],
  _timestamp: new Date(),
  currplayer: 1,
  lastmove: 'b4xe1',
  board: new Map(g.board),
}];

const before = g.serialize();
const patch = patchChameleonTerminalEogReason(before);
assert.equal(patch.changed, true);
assert.equal(patch.from, 'annihilation');
assert.equal(patch.to, 'stalemate');

const after = JSON.parse(patch.stateJson, reviver);
const eog = after.stack[after.stack.length - 1]._results.find((r) => r.type === 'eog');
assert.equal(eog.reason, 'stalemate');

console.log('chameleon-eog-backfill.test.mjs: ok');
