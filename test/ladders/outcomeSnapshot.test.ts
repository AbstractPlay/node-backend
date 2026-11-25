import { describe, expect, it } from 'vitest';
import {
  buildLadderOutcomeSnapshot,
  ladderGameRecordHasSnapshot,
  ladderGameSnapshotUpdateFragments,
  playerDisplayName,
  rankMapForLadderPlayers,
} from '../../lib/ladders/outcomeSnapshot.js';
import { ladderPlayerFixture } from '../fixtures/ladders.js';

describe('buildLadderOutcomeSnapshot', () => {
  const ladderPlayers = [
    ladderPlayerFixture('u1', 'L1', { points: 900, joinedAt: 1 }),
    ladderPlayerFixture('u2', 'L1', { points: 1100, joinedAt: 2 }),
  ];

  it('marks upset when winner had fewer points before', () => {
    const snap = buildLadderOutcomeSnapshot({
      players: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }],
      winner: [1],
      metaGame: 'amazons',
      ladderPlayers,
      winnerPointsBefore: 900,
      loserPointsBefore: 1100,
      winnerGain: 40,
      loserLoss: 35,
    });
    expect(snap.outcome).toBe('win');
    expect(snap.upset).toBe(true);
    expect(snap.playerNames).toEqual(['Alice', 'Bob']);
    expect(snap.winnerRankBefore).toBe(2);
    expect(snap.winnerRankAfter).toBe(2);
    expect(snap.loserRankBefore).toBe(1);
  });

  it('draw omits rank fields and sets zero deltas', () => {
    const snap = buildLadderOutcomeSnapshot({
      players: [{ id: 'u1' }, { id: 'u2' }],
      winner: [1, 2],
      metaGame: 'amazons',
      ladderPlayers,
    });
    expect(snap.outcome).toBe('draw');
    expect(snap.winnerGain).toBe(0);
    expect(snap.loserLoss).toBe(0);
    expect(snap.winnerId).toBeUndefined();
  });
});

describe('ladderGameSnapshotUpdateFragments', () => {
  it('skips undefined attrs', () => {
    const { setClauses } = ladderGameSnapshotUpdateFragments({
      outcome: 'draw',
      playerIds: ['a', 'b'],
      playerNames: ['A', 'B'],
      winnerGain: 0,
      loserLoss: 0,
    });
    expect(setClauses.some(c => c.includes('winnerId'))).toBe(false);
    expect(setClauses).toContain('#outcome = :outcome');
  });
});

describe('ladderGameRecordHasSnapshot', () => {
  it('detects win/draw outcomes', () => {
    expect(ladderGameRecordHasSnapshot({ outcome: 'win' })).toBe(true);
    expect(ladderGameRecordHasSnapshot({ outcome: 'draw' })).toBe(true);
    expect(ladderGameRecordHasSnapshot({})).toBe(false);
  });
});

describe('playerDisplayName', () => {
  it('falls back to id', () => {
    expect(playerDisplayName({ id: 'u1' })).toBe('u1');
    expect(playerDisplayName({ id: 'u1', name: ' Pat ' })).toBe('Pat');
  });
});

describe('rankMapForLadderPlayers', () => {
  it('honors point overrides', () => {
    const rows = [
      ladderPlayerFixture('low', 'L1', { points: 500 }),
      ladderPlayerFixture('high', 'L1', { points: 700 }),
    ];
    const base = rankMapForLadderPlayers(rows);
    expect(base.get('high')).toBe(1);
    const after = rankMapForLadderPlayers(rows, new Map([['low', 800]]));
    expect(after.get('low')).toBe(1);
  });
});