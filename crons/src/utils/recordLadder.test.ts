import { describe, expect, it } from 'vitest';
import { findLadderForGame, ladderEventLabelForGame } from './recordLadder.js';

const LADDER_ID = 'ladder-amazons-1';

describe('recordLadder', () => {
  const ladder = {
    pk: 'LADDER' as const,
    sk: LADDER_ID,
    id: LADDER_ID,
    metaGame: 'amazons',
    variants: [],
  };

  it('findLadderForGame matches sk or id', () => {
    expect(findLadderForGame([ladder], LADDER_ID)).toBe(ladder);
    expect(findLadderForGame([ladder], 'missing')).toBeUndefined();
  });

  it('ladderEventLabelForGame uses game meta when present', () => {
    const label = ladderEventLabelForGame([ladder], LADDER_ID, 'amazons', []);
    expect(label.startsWith('Ladder: ')).toBe(true);
    expect(label).toContain('Amazons');
  });

  it('ladderEventLabelForGame falls back when meta is missing', () => {
    expect(ladderEventLabelForGame([], LADDER_ID)).toBe(`Ladder (${LADDER_ID})`);
  });
});
