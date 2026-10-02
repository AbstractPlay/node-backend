import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeEarliestNextTournamentStartMs,
  daysUntilFromNow,
  formatDivisionStandingsPlainText,
} from '../../lib/tournaments/tournamentEndMessage.js';

describe('tournamentEndMessage helpers', () => {
  it('formats standings lines with place and points', () => {
    const text = formatDivisionStandingsPlainText([
      {
        playerid: 'a',
        playername: 'Alice',
        score: 2.5,
        tiebreak: 1,
        rating: 1500,
        order: 0,
      },
      {
        playerid: 'b',
        playername: 'Bob',
        score: 2,
        tiebreak: 0,
        rating: 1400,
        order: 1,
      },
    ]);
    assert.match(text, /^1\. Alice — 2\.5/);
    assert.match(text, /\n2\. Bob — 2$/);
  });

  it('computes earliest next start from series rules', () => {
    const created = 1_000_000;
    const ended = 2_000_000;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const twoWeeks = oneWeek * 2;
    assert.equal(
      computeEarliestNextTournamentStartMs(created, ended),
      Math.max(created + twoWeeks, ended + oneWeek),
    );
  });

  it('ceil days until start', () => {
    const day = 24 * 60 * 60 * 1000;
    const now = 0;
    assert.equal(daysUntilFromNow(day / 2, now), 1);
    assert.equal(daysUntilFromNow(0, now), 0);
  });
});
