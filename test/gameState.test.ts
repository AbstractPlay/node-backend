import { readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameFactory } from '@abstractplay/gameslib';
import {
  GAME_STATE_COMPRESS_THRESHOLD_BYTES,
  compressGameStateIfNeeded,
  decompressGameState,
  hydrateGameState,
  isCompressedGameState,
  prepareGameStateForStorage,
} from '../lib/gameState';

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8').trim();
}

const saltireState = loadFixture('saltire-state.json');
const storisendeRaw = loadFixture('storisende-raw.json');
const storisendeGz = loadFixture('storisende-gz.txt');

test('large saltire fixture exceeds compression threshold', () => {
  assert.ok(Buffer.byteLength(saltireState, 'utf8') > GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});

test('large storisende raw fixture exceeds compression threshold', () => {
  assert.ok(Buffer.byteLength(storisendeRaw, 'utf8') > GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});

test('compresses large state with gz prefix', () => {
  const compressed = compressGameStateIfNeeded(saltireState);
  assert.ok(compressed.startsWith('gz:'));
  assert.ok(Buffer.byteLength(compressed, 'utf8') < GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});

test('round-trip preserves large state', () => {
  const compressed = compressGameStateIfNeeded(saltireState);
  const restored = decompressGameState(compressed);
  assert.equal(restored, saltireState);
});

test('GameFactory accepts decompressed saltire state', () => {
  const restored = decompressGameState(compressGameStateIfNeeded(saltireState));
  const engine = GameFactory('saltire', restored);
  assert.ok(engine);
  assert.equal(engine.gameover, true);
  assert.deepEqual(engine.winner, [2]);
});

test('small state is not compressed', () => {
  const small = '{"game":"saltire","numplayers":2}';
  assert.equal(compressGameStateIfNeeded(small), small);
  assert.equal(isCompressedGameState(small), false);
});

test('legacy gameslib storisende gzip decompresses to raw state', () => {
  assert.equal(isCompressedGameState(storisendeGz), true);
  assert.equal(decompressGameState(storisendeGz), storisendeRaw);
});

test('GameFactory accepts gameslib-compressed storisende state after hydration', () => {
  const engine = GameFactory('storisende', decompressGameState(storisendeGz));
  assert.ok(engine);
  assert.equal(engine.gameover, true);
});

test('legacy base64 gzip without prefix decompresses', () => {
  const legacy = gzipSync(Buffer.from(saltireState, 'utf8')).toString('base64');
  assert.equal(isCompressedGameState(legacy), true);
  assert.equal(decompressGameState(legacy), saltireState);
});

test('does not double-compress gz or legacy formats', () => {
  const compressed = compressGameStateIfNeeded(saltireState);
  assert.equal(compressGameStateIfNeeded(compressed), compressed);
  assert.equal(compressGameStateIfNeeded(storisendeGz), storisendeGz);
});

test('backend re-compresses large raw storisende on storage', () => {
  const stored = compressGameStateIfNeeded(storisendeRaw);
  assert.ok(stored.startsWith('gz:'));
  assert.equal(decompressGameState(stored), storisendeRaw);
});

test('prepareGameStateForStorage compresses state only', () => {
  const record = {
    pk: 'GAME',
    sk: 'saltire#1#test',
    id: 'test',
    state: saltireState,
    metaGame: 'saltire',
  };
  const stored = prepareGameStateForStorage(record);
  assert.notEqual(stored, record);
  assert.ok(stored.state.startsWith('gz:'));
  assert.equal(stored.pk, 'GAME');
  assert.equal(stored.id, 'test');
});

test('hydrateGameState decompresses gameslib legacy state', () => {
  const record = { pk: 'GAME', sk: 'storisende#0#test', state: storisendeGz };
  const hydrated = hydrateGameState(record);
  assert.notEqual(hydrated, record);
  assert.equal(hydrated.state, storisendeRaw);
  assert.equal(hydrated.pk, 'GAME');
});

test('hydrateGameState decompresses backend gz state', () => {
  const stored = prepareGameStateForStorage({ pk: 'GAME', state: saltireState });
  const hydrated = hydrateGameState(stored);
  assert.notEqual(hydrated, stored);
  assert.equal(hydrated.state, saltireState);
  assert.equal(hydrated.pk, 'GAME');
});
