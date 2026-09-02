import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  gameWatchKey,
  watchingGamesFromRefs,
} from '../lib/wsConnectionStore.js';

test('watchingGamesFromRefs builds meta#id keys', () => {
  const refs = [
    { meta: 'chess', id: 'abc123' },
    { meta: 'go', id: 'xyz' },
  ];
  const watching = watchingGamesFromRefs(refs);
  assert.equal(watching.size, 2);
  assert.ok(watching.has(gameWatchKey('chess', 'abc123')));
  assert.ok(watching.has(gameWatchKey('go', 'xyz')));
});

test('watchingGamesFromRefs skips invalid entries', () => {
  const watching = watchingGamesFromRefs([
    { meta: 'chess' },
    { id: 'only-id' },
    null,
    { meta: 'go', id: 'valid' },
  ]);
  assert.equal(watching.size, 1);
  assert.ok(watching.has(gameWatchKey('go', 'valid')));
});

test('watchingGamesFromRefs returns empty set for non-array input', () => {
  assert.equal(watchingGamesFromRefs(undefined).size, 0);
  assert.equal(watchingGamesFromRefs(null).size, 0);
  assert.equal(watchingGamesFromRefs({}).size, 0);
});

test('watchingGamesFromRefs deduplicates duplicate refs', () => {
  const watching = watchingGamesFromRefs([
    { meta: 'chess', id: 'abc123' },
    { meta: 'chess', id: 'abc123' },
  ]);
  assert.equal(watching.size, 1);
});
