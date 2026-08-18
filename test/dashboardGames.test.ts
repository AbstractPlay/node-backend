import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentRowToGame,
  isActiveDashboardGame,
  mergeDashboardGames,
  staleLegacyActiveGameIds,
  type CurrentGameIndexRow,
  type DashboardGame,
} from '../lib/dashboardGames';
import type { RecentCompletedIndexRow } from '../lib/recentCompletedGames';
import { COMPLETED_DASHBOARD_RETENTION_MS } from '../lib/recentCompletedGames';
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

const completedRow: RecentCompletedIndexRow = {
  pk: 'RECENTCOMPLETED#u1',
  sk: 'g-done',
  metaGame: 'chess',
  players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
  clockHard: false,
  toMove: '',
  lastMoveTime: 50,
  numMoves: 10,
  gameEnded: 55,
};

const completedLegacy: DashboardGame = {
  id: 'g-done',
  metaGame: 'chess',
  players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
  clockHard: false,
  toMove: '',
  lastMoveTime: 50,
  numMoves: 10,
  seen: 1,
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

test('mergeDashboardGames prefers CURRENTGAMES# for active games', () => {
  const legacy: DashboardGame[] = [
    {
      id: 'g-active',
      metaGame: 'saltire',
      players: [{ id: 'u1', name: 'A' }],
      clockHard: false,
      toMove: '0',
      lastMoveTime: 1,
      numMoves: 3,
      seen: 99,
    },
    completedLegacy,
  ];
  const overlays = new Map<string, UserGameOverlay>([
    ['g-active', { seen: 5, lastChat: 6 }],
    ['g-done', { seen: 2 }],
  ]);

  const merged = mergeDashboardGames([activeRow], [completedRow], overlays, legacy);

  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.id, 'g-active');
  assert.equal(merged[0]!.clockHard, true);
  assert.equal(merged[0]!.numMoves, 7);
  assert.equal(merged[0]!.seen, 5);
  assert.equal(merged[0]!.lastChat, 6);
  assert.equal(merged[1]!.id, 'g-done');
  assert.equal(merged[1]!.seen, 2);
});

test('mergeDashboardGames prefers RECENTCOMPLETED# for completed games', () => {
  const legacy: DashboardGame[] = [completedLegacy];
  const overlays = new Map<string, UserGameOverlay>([
    ['g-done', { seen: 2, lastChat: 3 }],
  ]);

  const merged = mergeDashboardGames([], [completedRow], overlays, legacy);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.id, 'g-done');
  assert.equal(merged[0]!.gameEnded, 55);
  assert.equal(merged[0]!.seen, 2);
  assert.equal(merged[0]!.lastChat, 3);
});

test('mergeDashboardGames omits legacy completed when RECENTCOMPLETED# is authoritative', () => {
  const legacy: DashboardGame[] = [completedLegacy];
  const overlays = new Map<string, UserGameOverlay>();
  const otherCompleted: RecentCompletedIndexRow = {
    pk: 'RECENTCOMPLETED#u1',
    sk: 'g-other',
    metaGame: 'saltire',
    players: [{ id: 'u1', name: 'A' }],
    clockHard: false,
    toMove: '',
    lastMoveTime: 40,
  };

  const merged = mergeDashboardGames([], [otherCompleted], overlays, legacy);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.id, 'g-other');
});

test('mergeDashboardGames falls back to legacy games when index is empty', () => {
  const legacy: DashboardGame[] = [
    {
      id: 'g-active',
      metaGame: 'saltire',
      players: [{ id: 'u1', name: 'A' }],
      clockHard: true,
      toMove: '1',
      lastMoveTime: 10,
      seen: 3,
    },
  ];
  const overlays = new Map<string, UserGameOverlay>([
    ['g-active', { seen: 7 }],
  ]);

  const merged = mergeDashboardGames([], [], overlays, legacy);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.seen, 7);
});

test('mergeDashboardGames omits stale legacy completed games when index is empty', () => {
  const now = Date.now();
  const staleSeen = now - COMPLETED_DASHBOARD_RETENTION_MS - 1000;
  const legacy: DashboardGame[] = [
    {
      id: 'g-stale',
      metaGame: 'chess',
      players: [{ id: 'u1', name: 'A' }],
      clockHard: false,
      toMove: '',
      lastMoveTime: 50,
      seen: staleSeen,
      lastChat: staleSeen,
    },
  ];
  const overlays = new Map<string, UserGameOverlay>();

  const merged = mergeDashboardGames([], [], overlays, legacy);

  assert.equal(merged.length, 0);
});

test('mergeDashboardGames prefers RECENTCOMPLETED# over stale legacy active', () => {
  const staleActiveLegacy: DashboardGame = {
    id: 'g-done',
    metaGame: 'chess',
    players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
    clockHard: false,
    toMove: '0',
    lastMoveTime: 40,
    numMoves: 9,
  };
  const legacy: DashboardGame[] = [staleActiveLegacy, {
    id: 'g-active',
    metaGame: 'saltire',
    players: [{ id: 'u1', name: 'A' }],
    clockHard: true,
    toMove: '0',
    lastMoveTime: 10,
  }];
  const overlays = new Map<string, UserGameOverlay>([
    ['g-done', { seen: 2 }],
  ]);

  const merged = mergeDashboardGames([activeRow], [completedRow], overlays, legacy);

  assert.equal(merged.length, 2);
  const completed = merged.find(g => g.id === 'g-done');
  assert.ok(completed);
  assert.equal(completed!.toMove, '');
  assert.equal(completed!.gameEnded, 55);
  assert.equal(completed!.seen, 2);
});

test('mergeDashboardGames omits stale legacy active ghost when CURRENTGAMES# exists', () => {
  const legacy: DashboardGame[] = [{
    id: 'g-ghost',
    metaGame: 'chess',
    players: [{ id: 'u1', name: 'A' }],
    clockHard: true,
    toMove: '0',
    lastMoveTime: 20,
  }];

  const merged = mergeDashboardGames([activeRow], [], new Map(), legacy);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.id, 'g-active');
});

test('mergeDashboardGames shows completed from index when only RECENTCOMPLETED# exists', () => {
  const staleActiveLegacy: DashboardGame = {
    id: 'g-done',
    metaGame: 'chess',
    players: [{ id: 'u1', name: 'A' }],
    clockHard: false,
    toMove: '1',
    lastMoveTime: 40,
  };

  const merged = mergeDashboardGames([], [completedRow], new Map(), [staleActiveLegacy]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.id, 'g-done');
  assert.equal(merged[0]!.toMove, '');
  assert.equal(merged[0]!.gameEnded, 55);
});

test('staleLegacyActiveGameIds finds legacy active rows replaced by indexes', () => {
  const legacy: DashboardGame[] = [
    {
      id: 'g-done',
      metaGame: 'chess',
      players: [{ id: 'u1', name: 'A' }],
      clockHard: false,
      toMove: '0',
      lastMoveTime: 40,
    },
    {
      id: 'g-active',
      metaGame: 'saltire',
      players: [{ id: 'u1', name: 'A' }],
      clockHard: true,
      toMove: '0',
      lastMoveTime: 10,
    },
    {
      id: 'g-ghost',
      metaGame: 'chess',
      players: [{ id: 'u1', name: 'A' }],
      clockHard: true,
      toMove: '0',
      lastMoveTime: 20,
    },
  ];

  const stale = staleLegacyActiveGameIds(legacy, [activeRow], [completedRow]);

  assert.deepEqual(new Set(stale), new Set(['g-done', 'g-ghost']));
});
