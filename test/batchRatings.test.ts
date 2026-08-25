import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignTournamentPlayerRatings,
  batchRatingGameLabel,
  compareBatchRatings,
  defaultGlickoPrior,
  GLICKO_PRIOR_RATING_LOW,
  GLICKO_RATING_START,
  GLICKO_RD_START,
  lookupBatchRating,
  type TournamentSeedPlayer,
  type UserGameRating,
} from '../lib/batchRatings';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'batch-ratings.json'), 'utf8'),
) as {
  highest: UserGameRating[];
};

describe('batchRatingGameLabel', () => {
  it('labels no variants', () => {
    assert.equal(batchRatingGameLabel('Chess', []), 'Chess (no variants)');
  });

  it('labels sorted variant UIDs', () => {
    assert.equal(batchRatingGameLabel('Go', ['handicap', '9x9']), 'Go (9x9|handicap)');
  });
});

describe('defaultGlickoPrior', () => {
  it('uses 1200/350 start aligned with batch Elo', () => {
    const prior = defaultGlickoPrior();
    assert.equal(prior.rating, GLICKO_RATING_START);
    assert.equal(prior.rd, GLICKO_RD_START);
    assert.equal(prior.ratingLow, GLICKO_PRIOR_RATING_LOW);
  });
});

describe('lookupBatchRating', () => {
  it('finds an existing row', () => {
    const row = lookupBatchRating(fixture.highest, 'Chess', [], 'alice');
    assert.equal(row.user, 'alice');
    assert.equal(row.glicko?.ratingLow, 1200);
  });

  it('returns prior for missing user', () => {
    const row = lookupBatchRating(fixture.highest, 'Chess', [], 'unknown');
    assert.equal(row.glicko?.rating, 1200);
    assert.equal(row.glicko?.ratingLow, 500);
  });
});

describe('compareBatchRatings', () => {
  it('sorts by ratingLow descending', () => {
    const sorted = [...fixture.highest.filter((r) => r.game === 'Chess (no variants)')].sort(
      compareBatchRatings,
    );
    assert.equal(sorted[0]?.user, 'alice');
    assert.equal(sorted[1]?.user, 'bob');
  });
});

describe('assignTournamentPlayerRatings', () => {
  it('orders players by glicko ratingLow descending', () => {
    const players: TournamentSeedPlayer[] = [
      { playerid: 'bob' },
      { playerid: 'alice' },
      { playerid: 'unknown' },
    ];
    assignTournamentPlayerRatings(players, fixture.highest, 'Chess', []);
    players.sort((a, b) => b.rating! - a.rating!);
    assert.deepEqual(
      players.map((p) => p.playerid),
      ['alice', 'bob', 'unknown'],
    );
    assert.equal(players[0]?.rating, 1200);
    assert.equal(players[1]?.rating, 1090);
    assert.equal(players[2]?.rating, GLICKO_PRIOR_RATING_LOW);
  });
});
