import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { GameFactory } from '@abstractplay/gameslib';
import {
  assessReopenFalseTimeout,
  reopenSalvageTier,
} from '../lib/games/reopenFalseTimeout.js';
import type { GameRecord } from '../lib/gameProjector.js';

const HEX_START =
  '{"game":"hex","numplayers":2,"variants":["size-11"],"gameover":false,"winner":[],"stack":[{"_version":"20240101","_results":[],"_timestamp":"2026-01-01T00:00:00.000Z","currplayer":1,"board":{"dataType":"Map","value":[]},"connPath":[]}]}';

function timeoutCompletedHexRecord(): GameRecord {
  const engine = GameFactory('hex', HEX_START);
  assert.ok(engine);
  engine.timeout(1);
  const endedAt = new Date(engine.stack[engine.stack.length - 1]._timestamp).getTime();
  const beforeTimeout = new Date(engine.stack[engine.stack.length - 2]._timestamp).getTime();

  return {
    pk: 'GAME',
    sk: 'hex#1#test-game',
    id: 'test-game',
    metaGame: 'hex',
    numPlayers: 2,
    players: [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ],
    clockHard: true,
    rated: true,
    toMove: '',
    lastMoveTime: endedAt,
    gameEnded: endedAt,
    winner: engine.winner,
    numMoves: engine.stack.length - 1,
    state: engine.serialize(),
  };
}

describe('reopenFalseTimeout', () => {
  it('classifies rated correspondence without hooks', () => {
    const tier = reopenSalvageTier({
      pk: 'GAME',
      sk: 'hex#1#g',
      id: 'g',
      metaGame: 'hex',
      numPlayers: 2,
      players: [],
      clockHard: true,
      rated: true,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
    });
    assert.equal(tier, 'rated_casual');
  });

  it('rewinds timeout ply and restores active fields', () => {
    const completed = timeoutCompletedHexRecord();
    const beforeMoves = completed.numMoves;
    const assess = assessReopenFalseTimeout(completed, { timedOutSeat: 1 });
    assert.equal(assess.ok, true);
    if (!assess.ok) return;

    assert.equal(assess.active.sk, 'hex#0#test-game');
    assert.equal(assess.active.toMove, '0');
    assert.equal(assess.active.numMoves, beforeMoves! - 1);
    assert.equal(assess.active.lastMoveTime, assess.audit.lastMoveTimeAfter);
    assert.ok(assess.active.lastMoveTime < completed.lastMoveTime!);
    assert.equal(assess.active.winner, undefined);
    assert.equal(assess.active.gameEnded, undefined);

    const restored = GameFactory('hex', assess.active.state);
    assert.ok(restored);
    assert.equal(restored.gameover, false);
    assert.deepEqual(restored.winner, []);
  });

  it('rejects non-timeout completions', () => {
    const engine = GameFactory('hex', HEX_START);
    assert.ok(engine);
    engine.resign(2);
    const completed: GameRecord = {
      ...timeoutCompletedHexRecord(),
      state: engine.serialize(),
      winner: engine.winner,
    };
    const assess = assessReopenFalseTimeout(completed);
    assert.equal(assess.ok, false);
    if (assess.ok) return;
    assert.match(assess.reason, /timeout/i);
  });
});
