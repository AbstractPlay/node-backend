import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  applySeatLeave,
  validateDirectChallengeSeats,
  seatInvariantHolds,
} from '../lib/challenges/seatAccounting.js';
import type { User } from '../lib/api/types.js';

const alice: User = { id: 'a', name: 'Alice' };
const bob: User = { id: 'b', name: 'Bob' };
const charlie: User = { id: 'c', name: 'Charlie' };

describe('challenge seat accounting', () => {
  it('validates Bob + Anyone for 3-player direct', () => {
    assert.equal(validateDirectChallengeSeats(3, [bob], 1), undefined);
    assert.equal(
      seatInvariantHolds({
        numPlayers: 3,
        challenger: alice,
        players: [alice],
        challengees: [bob],
        openSlots: 1,
      }),
      true,
    );
  });

  it('rejects all-open closed 3-player', () => {
    assert.match(
      validateDirectChallengeSeats(3, [], 2) ?? '',
      /at least one named|opponent/i,
    );
    assert.match(
      validateDirectChallengeSeats(3, [bob], 2) ?? '',
      /open challenge/i,
    );
  });

  it('3p direct Bob decline opens slot', () => {
    const { challenge, mode } = applySeatLeave(
      {
        numPlayers: 3,
        standing: false,
        challenger: alice,
        players: [alice],
        challengees: [bob, charlie],
        openSlots: 0,
      },
      bob.id,
    );
    assert.equal(mode, 'partial');
    assert.deepEqual(challenge.challengees?.map(u => u.id), ['c']);
    assert.equal(challenge.openSlots, 1);
  });

  it('3p direct accepter withdraw opens slot', () => {
    const { challenge, mode } = applySeatLeave(
      {
        numPlayers: 3,
        standing: false,
        challenger: alice,
        players: [alice, bob],
        challengees: [charlie],
        openSlots: 0,
      },
      bob.id,
    );
    assert.equal(mode, 'partial');
    assert.deepEqual(challenge.players?.map(u => u.id), ['a']);
    assert.equal(challenge.openSlots, 1);
  });

  it('2p direct decline is full remove', () => {
    const { mode } = applySeatLeave(
      {
        numPlayers: 2,
        standing: false,
        challenger: alice,
        players: [alice],
        challengees: [bob],
      },
      bob.id,
    );
    assert.equal(mode, 'full');
  });

  it('3p standing withdraw is partial without openSlots', () => {
    const { challenge, mode } = applySeatLeave(
      {
        numPlayers: 3,
        standing: true,
        challenger: alice,
        players: [alice, bob],
        openSlots: 0,
      },
      bob.id,
    );
    assert.equal(mode, 'partial');
    assert.deepEqual(challenge.players?.map(u => u.id), ['a']);
    assert.equal(challenge.openSlots, 0);
  });
});
