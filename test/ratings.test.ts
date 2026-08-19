import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYER_RATING,
  expectedScorePlayer1,
  getRatingK,
  player1ScoreFromResult,
  updateTwoPlayerRatings,
} from '../lib/ratings';

test('getRatingK follows backend tiers', () => {
  assert.equal(getRatingK(0), 40);
  assert.equal(getRatingK(9), 40);
  assert.equal(getRatingK(10), 30);
  assert.equal(getRatingK(19), 30);
  assert.equal(getRatingK(20), 25);
  assert.equal(getRatingK(39), 25);
  assert.equal(getRatingK(40), 20);
});

test('updateTwoPlayerRatings matches backend win calculation', () => {
  const p1 = { rating: 1500, N: 15, wins: 10, draws: 2 };
  const p2 = { rating: 1400, N: 5, wins: 3, draws: 1 };

  const [newP1, newP2] = updateTwoPlayerRatings(p1, p2, 1);

  const expected = expectedScorePlayer1(p1.rating, p2.rating);
  assert.equal(newP1.rating, p1.rating + getRatingK(p1.N) * (1 - expected));
  assert.equal(newP2.rating, p2.rating + getRatingK(p2.N) * (expected - 1));
  assert.equal(newP1.N, p1.N + 1);
  assert.equal(newP2.N, p2.N + 1);
  assert.equal(newP1.wins, p1.wins + 1);
  assert.equal(newP2.wins, p2.wins);
  assert.equal(newP1.draws, p1.draws);
  assert.equal(newP2.draws, p2.draws);
});

test('updateTwoPlayerRatings handles draws', () => {
  const p1 = { ...DEFAULT_PLAYER_RATING, rating: 1200, N: 0 };
  const p2 = { ...DEFAULT_PLAYER_RATING, rating: 1200, N: 0 };

  const [newP1, newP2] = updateTwoPlayerRatings(p1, p2, player1ScoreFromResult('draw'));

  assert.equal(newP1.rating, 1200);
  assert.equal(newP2.rating, 1200);
  assert.equal(newP1.draws, 1);
  assert.equal(newP2.draws, 1);
});
