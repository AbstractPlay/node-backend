import { afterEach, describe, expect, it } from 'vitest';
import {
  formatLadderDisplayName,
  resetLadderDisplayNameLocaleForTests,
} from '../../lib/ladders/displayName.js';

describe('formatLadderDisplayName', () => {
  afterEach(() => {
    resetLadderDisplayNameLocaleForTests();
  });

  it('matches front hub title when there are no variant options (amoeba)', () => {
    expect(formatLadderDisplayName('amoeba', [])).toBe('Amoeba ladder');
  });

  it('expands implicit default variants (amazons)', () => {
    const name = formatLadderDisplayName('amazons', []);
    expect(name).toMatch(/^Amazons ladder \(/);
    expect(name).not.toContain('no variants');
    expect(name).not.toContain('#setup');
  });

  it('uses human variant labels for explicit uids (go)', () => {
    const name = formatLadderDisplayName('go', ['size-9']);
    expect(name).toMatch(/^Go ladder \(/);
    expect(name).not.toContain('size-9');
  });
});
