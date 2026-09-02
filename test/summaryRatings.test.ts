import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { assignTournamentPlayerRatings, type TournamentSeedPlayer, type UserGameRating } from '../lib/batchRatings.js';
import {
  clearSummaryRatingsCacheForTests,
  loadSummaryPlayerCountsByUid,
  loadSummaryRatingsHighest,
  setSummaryRatingsCacheForTests,
} from '../lib/summaryRatings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'batch-ratings.json'), 'utf8'),
) as {
  highest: UserGameRating[];
  playerCountsByUid?: Record<string, number>;
};

describe('loadSummaryRatingsHighest', () => {
  beforeAll(() => {
    setSummaryRatingsCacheForTests(fixture.highest, fixture.playerCountsByUid ?? {});
  });

  afterAll(() => {
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
