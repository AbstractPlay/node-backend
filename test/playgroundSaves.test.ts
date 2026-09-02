import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  GAME_STATE_COMPRESS_THRESHOLD_BYTES,
  hydratePlaygroundBody,
  isCompressedGameState,
  preparePlaygroundBodyForStorage,
} from '../lib/gameState.js';
import { validatePlaygroundSaveInput } from '../lib/playgroundSaves.js';

const smallBody = JSON.stringify({ board: [[1, 2], [3, 4]] });

function largeBody(): string {
  const padding = 'x'.repeat(GAME_STATE_COMPRESS_THRESHOLD_BYTES);
  return JSON.stringify({ data: padding });
}

test('preparePlaygroundBodyForStorage leaves small body unchanged', () => {
  const record = { pk: 'PLAYGROUND#u', sk: 'id', id: 'id', name: 'test', metaGame: 'saltire', date: 1, body: smallBody };
  const stored = preparePlaygroundBodyForStorage(record);
  assert.equal(stored.body, smallBody);
  assert.equal(isCompressedGameState(stored.body), false);
});

test('preparePlaygroundBodyForStorage compresses large body with gz prefix', () => {
  const body = largeBody();
  const record = { pk: 'PLAYGROUND#u', sk: 'id', id: 'id', name: 'test', metaGame: 'saltire', date: 1, body };
  const stored = preparePlaygroundBodyForStorage(record);
  assert.ok(stored.body.startsWith('gz:'));
  assert.ok(Buffer.byteLength(stored.body, 'utf8') < GAME_STATE_COMPRESS_THRESHOLD_BYTES);
});

test('hydratePlaygroundBody round-trips large body', () => {
  const body = largeBody();
  const record = { pk: 'PLAYGROUND#u', sk: 'id', id: 'id', name: 'test', metaGame: 'saltire', date: 1, body };
  const stored = preparePlaygroundBodyForStorage(record);
  const hydrated = hydratePlaygroundBody(stored);
  assert.equal(hydrated.body, body);
});

test('validatePlaygroundSaveInput accepts valid input', () => {
  const result = validatePlaygroundSaveInput({
    name: 'My save',
    metaGame: 'saltire',
    date: '2026-01-15T12:00:00.000Z',
    body: smallBody,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.name, 'My save');
    assert.equal(result.data.metaGame, 'saltire');
    assert.equal(result.data.date, new Date('2026-01-15T12:00:00.000Z').getTime());
    assert.equal(result.data.body, smallBody);
  }
});

test('validatePlaygroundSaveInput rejects empty name', () => {
  const result = validatePlaygroundSaveInput({
    name: '  ',
    metaGame: 'saltire',
    date: Date.now(),
    body: smallBody,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /name/i);
  }
});

test('validatePlaygroundSaveInput rejects invalid JSON body', () => {
  const result = validatePlaygroundSaveInput({
    name: 'test',
    metaGame: 'saltire',
    date: Date.now(),
    body: 'not json',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /JSON/i);
  }
});

test('validatePlaygroundSaveInput rejects invalid date', () => {
  const result = validatePlaygroundSaveInput({
    name: 'test',
    metaGame: 'saltire',
    date: 'not-a-date',
    body: smallBody,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /date/i);
  }
});
