import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { assignTournamentPlayerRatings, type TournamentSeedPlayer, type UserGameRating } from '../lib/batchRatings';
import {
  clearSummaryRatingsCacheForTests,
  loadSummaryPlayerCountsByUid,
  loadSummaryRatingsHighest,
  setSummaryRatingsCacheForTests,
} from '../lib/summaryRatings';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'batch-ratings.json'), 'utf8'),
) as {
  highest: UserGameRating[];
  playerCountsByUid?: Record<string, number>;
};

describe('loadSummaryRatingsHighest', () => {
  before(() => {
    setSummaryRatingsCacheForTests(fixture.highest, fixture.playerCountsByUid ?? {});
  });

  after(() => {
    clearSummaryRatingsCacheForTests();
  });

  it('returns cached highest rows for tournament seeding', async () => {
    const highest = await loadSummaryRatingsHighest();
    const players: TournamentSeedPlayer[] = [{ playerid: 'bob' }, { playerid: 'alice' }];
    assignTournamentPlayerRatings(players, highest, 'Chess', []);
    players.sort((a, b) => b.rating! - a.rating!);
    assert.equal(players[0]?.playerid, 'alice');
    assert.equal(players[0]?.rating, 1200);
  });

  it('returns playerCountsByUid from cache', async () => {
    const counts = await loadSummaryPlayerCountsByUid();
    assert.deepEqual(counts, fixture.playerCountsByUid ?? {});
  });
});
