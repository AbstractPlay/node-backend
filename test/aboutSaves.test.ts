import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  ABOUT_SAVES_PER_DAY_LIMIT,
  checkAboutSaveAllowed,
  utcDateString,
} from '../lib/aboutSaves.js';

const TODAY = new Date('2026-08-25T15:00:00.000Z');

test('utcDateString uses UTC calendar day', () => {
  assert.equal(utcDateString(TODAY), '2026-08-25');
});

test('checkAboutSaveAllowed skips unchanged text', () => {
  const result = checkAboutSaveAllowed('same text', 'same text', {}, TODAY);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.skip, true);
  }
});

test('checkAboutSaveAllowed increments count on same day', () => {
  const result = checkAboutSaveAllowed('old', 'new', {
    aboutSaveDay: '2026-08-25',
    aboutSaveCount: 3,
  }, TODAY);
  assert.equal(result.ok, true);
  if (result.ok && !result.skip) {
    assert.equal(result.aboutSaveDay, '2026-08-25');
    assert.equal(result.aboutSaveCount, 4);
  }
});

test('checkAboutSaveAllowed resets count on new day', () => {
  const result = checkAboutSaveAllowed('old', 'new', {
    aboutSaveDay: '2026-08-24',
    aboutSaveCount: 9,
  }, TODAY);
  assert.equal(result.ok, true);
  if (result.ok && !result.skip) {
    assert.equal(result.aboutSaveDay, '2026-08-25');
    assert.equal(result.aboutSaveCount, 1);
  }
});

test('checkAboutSaveAllowed blocks when daily limit reached', () => {
  const result = checkAboutSaveAllowed('old', 'new', {
    aboutSaveDay: '2026-08-25',
    aboutSaveCount: ABOUT_SAVES_PER_DAY_LIMIT,
  }, TODAY);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /rate limit/i);
  }
});
