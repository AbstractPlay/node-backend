import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  findDisplayNameConflict,
  normalizeDisplayNameForUniqueness,
} from '../lib/displayNameAvailability.js';

test('normalizeDisplayNameForUniqueness trims and lowercases', () => {
  assert.equal(normalizeDisplayNameForUniqueness('  Alice  '), 'alice');
  assert.equal(normalizeDisplayNameForUniqueness('BOB'), 'bob');
});

test('findDisplayNameConflict matches case-insensitively', () => {
  const directory = [{ id: 'u1', name: 'Alice' }];
  assert.equal(findDisplayNameConflict('alice', directory), true);
  assert.equal(findDisplayNameConflict('ALICE', directory), true);
  assert.equal(findDisplayNameConflict('Bob', directory), false);
});

test('findDisplayNameConflict ignores excluded userid', () => {
  const directory = [{ id: 'u1', name: 'Alice' }];
  assert.equal(findDisplayNameConflict('Alice', directory, 'u1'), false);
  assert.equal(findDisplayNameConflict('Alice', directory, 'u2'), true);
});

test('findDisplayNameConflict includes bot rows in directory', () => {
  const directory = [
    { id: 'human-1', name: 'Helper' },
    { id: 'bot-sk', name: 'Helper' },
  ];
  assert.equal(findDisplayNameConflict('helper', directory, 'human-2'), true);
});
