import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  applySkipRatingFlags,
  assessGameForRatingExclusion,
  playersWithoutSkipRating,
  validateExclusionUserIds,
} from '../lib/games/gameRatingExclusion.js';
import type { GameRecord } from '../lib/gameProjector.js';

describe('gameRatingExclusion', () => {
  it('applySkipRatingFlags sets and clears by user id', () => {
    const players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    const set = applySkipRatingFlags(players, ['a'], 'set');
    assert.equal(set.players[0]!.skipRating, true);
    assert.equal(set.players[1]!.skipRating, undefined);
    assert.deepEqual(set.changedUserIds, ['a']);

    const clear = applySkipRatingFlags(set.players, ['a'], 'clear');
    assert.equal(clear.players[0]!.skipRating, undefined);
    assert.deepEqual(clear.changedUserIds, ['a']);
  });

  it('assessGameForRatingExclusion requires completed rated correspondence', () => {
    const completed: GameRecord = {
      pk: 'GAME',
      sk: 'hex#1#g',
      id: 'g',
      metaGame: 'hex',
      numPlayers: 2,
      players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      clockHard: true,
      rated: true,
      toMove: '',
      lastMoveTime: 1,
      state: '{}',
    };
    assert.equal(assessGameForRatingExclusion(completed).ok, true);

    const active = { ...completed, sk: 'hex#0#g' };
    assert.equal(assessGameForRatingExclusion(active).ok, false);
  });

  it('validateExclusionUserIds rejects unknown seats', () => {
    assert.equal(
      validateExclusionUserIds([{ id: 'a', name: 'A' }], ['x']),
      'User x is not a player in this game',
    );
  });

  it('playersWithoutSkipRating strips flags for reopen', () => {
    const out = playersWithoutSkipRating([
      { id: 'a', name: 'A', skipRating: true },
      { id: 'b', name: 'B' },
    ]);
    assert.equal(out[0]!.skipRating, undefined);
    assert.equal(out[1]!.skipRating, undefined);
  });
});
