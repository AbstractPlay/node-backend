import { test } from 'vitest';
import assert from 'node:assert/strict';
import { GameFactory } from '@abstractplay/gameslib';
import {
  applyPerspectivePlayerRotations,
  flagSetIncludes,
  sessionIsSimultaneous,
} from '../lib/effectiveGameFlags.js';
import { initialToMove } from '../lib/games/initialToMove.js';

test('flagSetIncludes checks membership', () => {
  assert.equal(flagSetIncludes(['pie-even', 'check'], 'pie-even'), true);
  assert.equal(flagSetIncludes(['check'], 'pie-even'), false);
  assert.equal(flagSetIncludes(undefined, 'pie'), false);
});

test('applyPerspectivePlayerRotations sets 180-degree increments by default', () => {
  const players: Array<{ settings?: { rotate: number } }> = [{}, {}, {}];
  applyPerspectivePlayerRotations(players, 3, ['perspective']);
  assert.deepEqual(players[1].settings, { rotate: 180 });
  assert.deepEqual(players[2].settings, { rotate: 360 });
});

test('applyPerspectivePlayerRotations uses rotate90 for 3+ players', () => {
  const players: Array<{ settings?: { rotate: number } }> = [{}, {}, {}, {}];
  applyPerspectivePlayerRotations(players, 4, ['perspective', 'rotate90']);
  assert.deepEqual(players[1].settings, { rotate: -90 });
  assert.deepEqual(players[3].settings, { rotate: -270 });
});

test('applyPerspectivePlayerRotations is a no-op without perspective', () => {
  const players: Array<{ settings?: { rotate: number } }> = [{}, {}];
  applyPerspectivePlayerRotations(players, 2, ['rotate90']);
  assert.equal(players[1].settings, undefined);
});

test('sessionIsSimultaneous uses getFlags for catalog simultaneous games', () => {
  const thricewise = GameFactory('thricewise', 2);
  assert.ok(thricewise);
  assert.equal(sessionIsSimultaneous(thricewise, 'thricewise'), true);
  assert.equal(thricewise!.turnModel(), 'sequenced');
});

test('sessionIsSimultaneous is false for sequential games', () => {
  assert.equal(sessionIsSimultaneous(undefined, 'connections', {}), false);
});

test('initialToMove uses boolean[] for simultaneous catalog games', () => {
  const engine = GameFactory('thricewise', 2);
  assert.ok(engine);
  const toMove = initialToMove(engine, 'thricewise', 2);
  assert.deepEqual(toMove, [true, true]);
});

test('initialToMove uses currplayer seat for sequential games', () => {
  const engine = GameFactory('saltire', undefined, []);
  assert.ok(engine);
  assert.equal(typeof engine.currplayer, 'number');
  const toMove = initialToMove(engine, 'saltire', 2);
  assert.equal(toMove, `${engine.currplayer! - 1}`);
});
