import { describe, expect, it } from 'vitest';
import { formatLadderDisplayName } from '../../lib/ladders/displayName.js';

describe('formatLadderDisplayName', () => {
  it('prefixes Ladder and uses batch rating label shape', () => {
    const name = formatLadderDisplayName('amazons', []);
    expect(name.startsWith('Ladder: ')).toBe(true);
    expect(name).toContain('Amazons');
  });
});
