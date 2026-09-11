import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  isBlankDisplayName,
  placeholderUserDisplayName,
  validateUserDisplayName,
  MAX_USER_DISPLAY_NAME_LENGTH,
} from '../lib/userDisplayName.js';

test('validateUserDisplayName accepts trimmed name', () => {
  const result = validateUserDisplayName('  Alice  ');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.name, 'Alice');
  }
});

test('validateUserDisplayName rejects non-string', () => {
  const result = validateUserDisplayName(null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /string/i);
  }
});

test('validateUserDisplayName rejects empty and whitespace', () => {
  for (const value of ['', '   ', '\t']) {
    const result = validateUserDisplayName(value);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /required/i);
    }
  }
});

test('validateUserDisplayName rejects names over max length', () => {
  const result = validateUserDisplayName('x'.repeat(MAX_USER_DISPLAY_NAME_LENGTH + 1));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /at most/i);
  }
});

test('isBlankDisplayName treats missing and whitespace as blank', () => {
  assert.equal(isBlankDisplayName(undefined), true);
  assert.equal(isBlankDisplayName(''), true);
  assert.equal(isBlankDisplayName('  '), true);
  assert.equal(isBlankDisplayName('Bob'), false);
});

test('placeholderUserDisplayName uses first eight id characters', () => {
  assert.equal(
    placeholderUserDisplayName('abcdef12-3456-7890-abcd-ef1234567890'),
    'Player-abcdef12',
  );
});
