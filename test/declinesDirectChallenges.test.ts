import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { declinesDirectChallenges } from '../lib/challenges.js';

describe('declinesDirectChallenges', () => {
  it('returns false when settings missing or flag unset', () => {
    assert.equal(declinesDirectChallenges(undefined), false);
    assert.equal(declinesDirectChallenges(null), false);
    assert.equal(declinesDirectChallenges({}), false);
    assert.equal(declinesDirectChallenges({ all: {} }), false);
    assert.equal(declinesDirectChallenges({ all: { noDirectChallenges: false } }), false);
  });

  it('returns true when settings.all.noDirectChallenges is true', () => {
    assert.equal(
      declinesDirectChallenges({ all: { noDirectChallenges: true } }),
      true,
    );
  });
});
