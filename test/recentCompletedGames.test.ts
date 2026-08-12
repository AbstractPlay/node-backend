import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETED_DASHBOARD_RETENTION_MS,
  recentCompletedRowToGame,
  shouldBeOnCompletedDashboard,
} from '../lib/recentCompletedGames';

test('recentCompletedRowToGame maps completed summary fields', () => {
  const game = recentCompletedRowToGame({
    pk: 'RECENTCOMPLETED#u1',
    sk: 'g1',
    metaGame: 'chess',
    players: [{ id: 'u1', name: 'A' }],
    clockHard: true,
    lastMoveTime: 100,
    numMoves: 12,
    gameEnded: 101,
    winner: [1],
  });
  assert.equal(game.id, 'g1');
  assert.equal(game.toMove, '');
  assert.equal(game.numMoves, 12);
  assert.equal(game.gameEnded, 101);
  assert.deepEqual(game.winner, [1]);
});

test('shouldBeOnCompletedDashboard keeps unseen completed games', () => {
  assert.equal(shouldBeOnCompletedDashboard({ toMove: '' }), true);
  assert.equal(shouldBeOnCompletedDashboard({ toMove: '', seen: undefined }), true);
});

test('shouldBeOnCompletedDashboard evicts stale seen when lastChat is not newer', () => {
  const now = Date.now();
  const seen = now - COMPLETED_DASHBOARD_RETENTION_MS - 1000;
  assert.equal(shouldBeOnCompletedDashboard({ toMove: '', seen, lastChat: seen }, now), false);
});

test('shouldBeOnCompletedDashboard keeps games with chat after seen', () => {
  const now = Date.now();
  const seen = now - COMPLETED_DASHBOARD_RETENTION_MS - 1000;
  assert.equal(shouldBeOnCompletedDashboard({ toMove: '', seen, lastChat: seen + 1 }, now), true);
});
