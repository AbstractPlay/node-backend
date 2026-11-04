import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import {
  repairTableroStackJson,
  verifyTableroStackIntegrity,
} from '@abstractplay/gameslib';
import {
  decompressGameState,
  prepareGameStateForStorage,
  resolveVariantFieldsForGameRecord,
} from '../../lib/gameState.ts';
import {
  assessTableroRow,
  formatAuditCsvLine,
  isGenuineUnreplayable,
  isInFlight,
  matchesScope,
} from '../../scripts/lib/tablero-stack-backfill.mjs';

const META_GAME = 'tablero';
const deps = {
  metaGame: META_GAME,
  decompressGameState,
  resolveVariantFieldsForGameRecord,
  verifyTableroStackIntegrity,
  repairTableroStackJson,
  prepareGameStateForStorage,
};

/** @type {import('@abstractplay/gameslib').GameFactory} */
let GameFactory;

before(async () => {
  ({ GameFactory } = await import('@abstractplay/gameslib'));
});

function legacyCorruptTableroState() {
  const g = GameFactory('tablero', undefined, []);
  assert.ok(g);
  const engine = g;
  const openingC3 = [2, 2];
  const shared = [2, 2];
  const dupResults = [
    { type: 'take', from: 'c3' },
    { type: 'roll', values: [5, 6] },
  ];
  const moveFrame = (overrides) => ({
    _version: engine.stack[0]._version,
    _results: [],
    _timestamp: new Date(),
    currplayer: 1,
    board: new Map(),
    roll: [3, 4],
    pieces: [12, 12],
    ...overrides,
  });
  engine.stack = [
    moveFrame({
      currplayer: 2,
      roll: [5, 5],
      board: new Map([['c3', openingC3]]),
    }),
    moveFrame({
      currplayer: 2,
      roll: [5, 6],
      lastmove: '-c3',
      _results: dupResults,
      board: new Map([['c3', shared]]),
      pieces: [12, 13],
    }),
    moveFrame({
      currplayer: 2,
      roll: [5, 6],
      lastmove: 'pass',
      _results: dupResults,
      board: new Map([['c3', shared]]),
      pieces: [12, 13],
    }),
  ];
  shared.pop();
  return engine.serialize();
}

describe('tablero-stack-backfill', () => {
  it('matchesScope separates in-flight and completed', () => {
    assert.equal(matchesScope({ gameEnded: undefined }, 'in-flight'), true);
    assert.equal(matchesScope({ gameEnded: undefined }, 'completed'), false);
    assert.equal(matchesScope({ gameEnded: 1 }, 'completed'), true);
    assert.equal(matchesScope({ gameEnded: 1 }, 'in-flight'), false);
    assert.equal(matchesScope({ gameEnded: 1 }, 'all'), true);
  });

  it('assessTableroRow flags corrupt legacy stack for repair', () => {
    const broken = legacyCorruptTableroState();
    const row = assessTableroRow({
      pk: 'GAME',
      sk: 'tablero#0#audit-test',
      metaGame: 'tablero',
      state: broken,
      numMoves: 2,
    }, deps);

    assert.equal(row.verifyOk, true);
    assert.equal(row.repairChanged, true);
    assert.equal(row.needsUpdate, true);
    assert.equal(row.inFlight, isInFlight({ gameEnded: undefined }));
    assert.equal(row.unreplayable, false);
    assert.equal(row.stored.numMoves, 2);
  });

  it('assessTableroRow leaves clean state unchanged', () => {
    const g = GameFactory('tablero', undefined, []);
    assert.ok(g);
    g.stack[0].board = new Map([['a3', [2]]]);
    g.currplayer = 2;
    g.roll = [6, 6];
    g.load(0);
    g.move('-a3', { trusted: true });
    const clean = g.serialize();
    const row = assessTableroRow({
      pk: 'GAME',
      sk: 'tablero#1#clean',
      metaGame: 'tablero',
      state: clean,
      numMoves: 2,
      gameEnded: Date.now(),
    }, deps);

    assert.equal(row.verifyOk, true);
    assert.equal(row.needsUpdate, false);
  });

  it('formatAuditCsvLine escapes commas in reason', () => {
    const line = formatAuditCsvLine({
      sk: 'tablero#0#x',
      inFlight: true,
      verifyOk: false,
      repairChanged: false,
      needsUpdate: false,
      failureClass: 'tip_mismatch',
      reason: 'tip playfields mismatch, abort',
      option4Attempted: false,
      unreplayable: true,
    });
    assert.match(line, /"tip playfields mismatch, abort"/);
  });

  it('isGenuineUnreplayable excludes withdrawal replay gaps', () => {
    assert.equal(
      isGenuineUnreplayable('Unable to process the various parts of the following move: resign', false, false),
      false,
    );
    assert.equal(isGenuineUnreplayable('tip playfields mismatch after replay (board)', false, false), true);
    assert.equal(isGenuineUnreplayable('tip playfields mismatch after replay (pieces)', false, false), true);
    assert.equal(isGenuineUnreplayable('tip playfields mismatch after replay (roll, currplayer)', false, false), false);
    assert.equal(isGenuineUnreplayable('tip playfields mismatch after replay', false, false), false);
  });
});
