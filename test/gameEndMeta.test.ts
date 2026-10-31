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
    assert.deepEqual(meta, { gameEndKind: 'normal' });
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
    assert.deepEqual(meta, { gameEndKind: 'normal', eogReason: 'stalemate' });
  });

  it('returns undefined when game is not over', () => {
    assert.equal(deriveGameEndMeta('hex', HEX_START), undefined);
  });
});
