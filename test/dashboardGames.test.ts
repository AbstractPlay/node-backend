import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentRowToGame,
  isActiveDashboardGame,
  listActiveGameKeys,
  mergeDashboardGames,
  type CurrentGameIndexRow,
} from '../lib/dashboardGames';
import type { UserGameOverlay } from '../lib/userGameOverlay';

const activeRow: CurrentGameIndexRow = {
  pk: 'CURRENTGAMES#u1',
  sk: 'g-active',
  metaGame: 'saltire',
  players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
  clockHard: true,
  toMove: '0',
  lastMoveTime: 100,
  numMoves: 7,
};

test('isActiveDashboardGame treats empty toMove as completed', () => {
  assert.equal(isActiveDashboardGame({ toMove: '' }), false);
  assert.equal(isActiveDashboardGame({ toMove: '0' }), true);
  assert.equal(isActiveDashboardGame({ toMove: null }), false);
});

test('currentRowToGame uses sk as id', () => {
  const game = currentRowToGame(activeRow);
  assert.equal(game.id, 'g-active');
  assert.equal(game.metaGame, 'saltire');
  assert.equal(game.numMoves, 7);
});

test('mergeDashboardGames merges CURRENTGAMES# with overlays', () => {
  const overlays = new Map<string, UserGameOverlay>([
    ['g-active', { seen: 5, lastChat: 6 }],
  ]);

  const merged = mergeDashboardGames([activeRow], overlays);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.id, 'g-active');
  assert.equal(merged[0]!.clockHard, true);
  assert.equal(merged[0]!.numMoves, 7);
  assert.equal(merged[0]!.seen, 5);
  assert.equal(merged[0]!.lastChat, 6);
});

test('mergeDashboardGames returns empty when indexes are empty', () => {
  const merged = mergeDashboardGames([], new Map());
  assert.equal(merged.length, 0);
});

test('listActiveGameKeys returns only active CURRENTGAMES# rows', async () => {
  const completedActiveRow: CurrentGameIndexRow = {
    ...activeRow,
    sk: 'g-done-active',
    toMove: '',
  };
  const client = {
    send: async () => ({
      Items: [activeRow, completedActiveRow],
    }),
  };

  const keys = await listActiveGameKeys(client as never, 'table', 'u1');

  assert.deepEqual(keys, [{ metaGame: 'saltire', id: 'g-active' }]);
});
