import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { vacationSchedulePolicyError } from '../lib/vacation/policy.js';

describe('vacation policy', () => {
  it('allows schedule for all users (universal scope)', () => {
    assert.equal(vacationSchedulePolicyError({ userId: 'any-user' }), null);
  });
});
