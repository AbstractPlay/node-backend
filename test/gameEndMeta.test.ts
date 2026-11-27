import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { GameFactory } from '@abstractplay/gameslib';
import { deriveGameEndMeta } from '../lib/gameEndMeta.js';

const HEX_START =
  '{"game":"hex","numplayers":2,"variants":["size-11"],"gameover":false,"winner":[],"stack":[{"_version":"20240101","_results":[],"_timestamp":"2026-01-01T00:00:00.000Z","currplayer":1,"board":{"dataType":"Map","value":[]},"connPath":[]}]}';

describe('deriveGameEndMeta', () => {
  it('detects resignation with seat', () => {
    const engine = GameFactory('hex', HEX_START);
    assert.ok(engine);
    engine.resign(2);
    const meta = deriveGameEndMeta('hex', engine.serialize());
    assert.deepEqual(meta, { gameEndKind: 'resign', gameEndPlayer: 2 });
  });

  it('detects timeout with seat', () => {
    const engine = GameFactory('hex', HEX_START);
    assert.ok(engine);
    engine.timeout(1);
    const meta = deriveGameEndMeta('hex', engine.serialize());
    assert.deepEqual(meta, { gameEndKind: 'timeout', gameEndPlayer: 1 });
  });

  it('detects abandonment', () => {
    const engine = GameFactory('hex', HEX_START);
    assert.ok(engine);
    engine.abandoned();
    const meta = deriveGameEndMeta('hex', engine.serialize());
    assert.deepEqual(meta, { gameEndKind: 'abandoned' });
  });

  it('detects agreed draw', () => {
    const engine = GameFactory('hex', HEX_START);
    assert.ok(engine);
    engine.draw();
    const meta = deriveGameEndMeta('hex', engine.serialize());
    assert.deepEqual(meta, { gameEndKind: 'draw' });
  });

  it('returns normal without eogReason when none on final ply', () => {
    const state = JSON.stringify({
      game: 'hex',
      numplayers: 2,
      variants: ['size-11'],
      gameover: true,
      winner: [1],
      stack: [
        {
          _version: '20240101',
          _timestamp: '2026-01-01T00:00:00.000Z',
          _results: [],
          currplayer: 1,
          connPath: [],
          board: { dataType: 'Map', value: [] },
        },
        {
          _version: '20240101',
          _timestamp: '2026-01-02T00:00:00.000Z',
          _results: [{ type: 'eog' }, { type: 'winners', players: [1] }],
          lastmove: 'c2',
          currplayer: 2,
          connPath: [],
          board: { dataType: 'Map', value: [['c2', 1]] },
        },
      ],
    });
    const meta = deriveGameEndMeta('hex', state);
    assert.equal(meta?.gameEndKind, 'normal');
    assert.equal(meta?.eogReason, undefined);
  });

  it('extracts eogReason from final ply results', () => {
    const state = JSON.stringify({
      game: 'hex',
      numplayers: 2,
      variants: ['size-11'],
      gameover: true,
      winner: [1],
      stack: [
        {
          _version: '20240101',
          _timestamp: '2026-01-01T00:00:00.000Z',
          _results: [],
          currplayer: 1,
          connPath: [],
          board: { dataType: 'Map', value: [] },
        },
        {
          _version: '20240101',
          _timestamp: '2026-01-02T00:00:00.000Z',
          _results: [
            { type: 'eog', reason: 'stalemate' },
            { type: 'winners', players: [1] },
          ],
          lastmove: 'pass',
          currplayer: 2,
          connPath: [],
          board: { dataType: 'Map', value: [] },
        },
      ],
    });
    const meta = deriveGameEndMeta('hex', state);
    assert.equal(meta?.gameEndKind, 'normal');
    assert.equal(meta?.eogReason, 'stalemate');
  });

  it('returns undefined when game is not over', () => {
    assert.equal(deriveGameEndMeta('hex', HEX_START), undefined);
  });

  it('records gameEndPlayer for yonkoma crosscut when eogSubjectSeat is implemented', () => {
    const engine = GameFactory('yonkoma');
    assert.ok(engine);
    const YONKOMA_CROSSCUT =
      'a1-c3,a10-b9,j10-g7,j1-c8,c3-d4,c8-d9,g7-f8,d9-e8,d4-f6,e8-f7,f8-e9,b9-c10,f6-e7,c10-d9,pass,f7-e8,e7-d8'.split(
        ',',
      );
    for (const m of YONKOMA_CROSSCUT) {
      engine.move(m);
    }
    assert.equal(engine.gameover, true);
    const meta = deriveGameEndMeta('yonkoma', engine.serialize());
    if (typeof engine.eogSubjectSeat === 'function') {
      assert.deepEqual(meta, {
        gameEndKind: 'normal',
        eogReason: 'crosscut',
        gameEndPlayer: 1,
      });
    } else {
      assert.deepEqual(meta, { gameEndKind: 'normal', eogReason: 'crosscut' });
    }
  });
});
