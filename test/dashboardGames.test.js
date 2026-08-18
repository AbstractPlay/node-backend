"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const dashboardGames_1 = require("../lib/dashboardGames");
const recentCompletedGames_1 = require("../lib/recentCompletedGames");
const activeRow = {
    pk: 'CURRENTGAMES#u1',
    sk: 'g-active',
    metaGame: 'saltire',
    players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
    clockHard: true,
    toMove: '0',
    lastMoveTime: 100,
    numMoves: 7,
};
const completedRow = {
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
const completedLegacy = {
    id: 'g-done',
    metaGame: 'chess',
    players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
    clockHard: false,
    toMove: '',
    lastMoveTime: 50,
    numMoves: 10,
    seen: 1,
};
(0, node_test_1.test)('isActiveDashboardGame treats empty toMove as completed', () => {
    strict_1.default.equal((0, dashboardGames_1.isActiveDashboardGame)({ toMove: '' }), false);
    strict_1.default.equal((0, dashboardGames_1.isActiveDashboardGame)({ toMove: '0' }), true);
    strict_1.default.equal((0, dashboardGames_1.isActiveDashboardGame)({ toMove: null }), false);
});
(0, node_test_1.test)('currentRowToGame uses sk as id', () => {
    const game = (0, dashboardGames_1.currentRowToGame)(activeRow);
    strict_1.default.equal(game.id, 'g-active');
    strict_1.default.equal(game.metaGame, 'saltire');
    strict_1.default.equal(game.numMoves, 7);
});
(0, node_test_1.test)('mergeDashboardGames prefers CURRENTGAMES# for active games', () => {
    const legacy = [
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
    const overlays = new Map([
        ['g-active', { seen: 5, lastChat: 6 }],
        ['g-done', { seen: 2 }],
    ]);
    const merged = (0, dashboardGames_1.mergeDashboardGames)([activeRow], [completedRow], overlays, legacy);
    strict_1.default.equal(merged.length, 2);
    strict_1.default.equal(merged[0].id, 'g-active');
    strict_1.default.equal(merged[0].clockHard, true);
    strict_1.default.equal(merged[0].numMoves, 7);
    strict_1.default.equal(merged[0].seen, 5);
    strict_1.default.equal(merged[0].lastChat, 6);
    strict_1.default.equal(merged[1].id, 'g-done');
    strict_1.default.equal(merged[1].seen, 2);
});
(0, node_test_1.test)('mergeDashboardGames prefers RECENTCOMPLETED# for completed games', () => {
    const legacy = [completedLegacy];
    const overlays = new Map([
        ['g-done', { seen: 2, lastChat: 3 }],
    ]);
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [completedRow], overlays, legacy);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].id, 'g-done');
    strict_1.default.equal(merged[0].gameEnded, 55);
    strict_1.default.equal(merged[0].seen, 2);
    strict_1.default.equal(merged[0].lastChat, 3);
});
(0, node_test_1.test)('mergeDashboardGames omits legacy completed when RECENTCOMPLETED# is authoritative', () => {
    const legacy = [completedLegacy];
    const overlays = new Map();
    const otherCompleted = {
        pk: 'RECENTCOMPLETED#u1',
        sk: 'g-other',
        metaGame: 'saltire',
        players: [{ id: 'u1', name: 'A' }],
        clockHard: false,
        toMove: '',
        lastMoveTime: 40,
    };
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [otherCompleted], overlays, legacy);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].id, 'g-other');
});
(0, node_test_1.test)('mergeDashboardGames falls back to legacy games when index is empty', () => {
    const legacy = [
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
    const overlays = new Map([
        ['g-active', { seen: 7 }],
    ]);
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [], overlays, legacy);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].seen, 7);
});
(0, node_test_1.test)('mergeDashboardGames omits stale legacy completed games when index is empty', () => {
    const now = Date.now();
    const staleSeen = now - recentCompletedGames_1.COMPLETED_DASHBOARD_RETENTION_MS - 1000;
    const legacy = [
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
    const overlays = new Map();
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [], overlays, legacy);
    strict_1.default.equal(merged.length, 0);
});
(0, node_test_1.test)('mergeDashboardGames prefers RECENTCOMPLETED# over stale legacy active', () => {
    const staleActiveLegacy = {
        id: 'g-done',
        metaGame: 'chess',
        players: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }],
        clockHard: false,
        toMove: '0',
        lastMoveTime: 40,
        numMoves: 9,
    };
    const legacy = [
        staleActiveLegacy,
        {
            id: 'g-active',
            metaGame: 'saltire',
            players: [{ id: 'u1', name: 'A' }],
            clockHard: true,
            toMove: '0',
            lastMoveTime: 10,
        },
    ];
    const overlays = new Map([
        ['g-done', { seen: 2 }],
    ]);
    const merged = (0, dashboardGames_1.mergeDashboardGames)([activeRow], [completedRow], overlays, legacy);
    strict_1.default.equal(merged.length, 2);
    const completed = merged.find(g => g.id === 'g-done');
    strict_1.default.ok(completed);
    strict_1.default.equal(completed.toMove, '');
    strict_1.default.equal(completed.gameEnded, 55);
    strict_1.default.equal(completed.seen, 2);
});
(0, node_test_1.test)('mergeDashboardGames omits stale legacy active ghost when CURRENTGAMES# exists', () => {
    const legacy = [{
            id: 'g-ghost',
            metaGame: 'chess',
            players: [{ id: 'u1', name: 'A' }],
            clockHard: true,
            toMove: '0',
            lastMoveTime: 20,
        }];
    const merged = (0, dashboardGames_1.mergeDashboardGames)([activeRow], [], new Map(), legacy);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].id, 'g-active');
});
(0, node_test_1.test)('mergeDashboardGames shows completed from index when only RECENTCOMPLETED# exists', () => {
    const staleActiveLegacy = {
        id: 'g-done',
        metaGame: 'chess',
        players: [{ id: 'u1', name: 'A' }],
        clockHard: false,
        toMove: '1',
        lastMoveTime: 40,
    };
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [completedRow], new Map(), [staleActiveLegacy]);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].id, 'g-done');
    strict_1.default.equal(merged[0].toMove, '');
    strict_1.default.equal(merged[0].gameEnded, 55);
});
(0, node_test_1.test)('staleLegacyActiveGameIds finds legacy active rows replaced by indexes', () => {
    const legacy = [
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
    const stale = (0, dashboardGames_1.staleLegacyActiveGameIds)(legacy, [activeRow], [completedRow]);
    strict_1.default.deepEqual(new Set(stale), new Set(['g-done', 'g-ghost']));
});
