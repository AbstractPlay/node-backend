"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const dashboardGames_1 = require("../lib/dashboardGames");
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
(0, node_test_1.test)('mergeDashboardGames merges CURRENTGAMES# and RECENTCOMPLETED# with overlays', () => {
    const overlays = new Map([
        ['g-active', { seen: 5, lastChat: 6 }],
        ['g-done', { seen: 2, lastChat: 3 }],
    ]);
    const merged = (0, dashboardGames_1.mergeDashboardGames)([activeRow], [completedRow], overlays);
    strict_1.default.equal(merged.length, 2);
    strict_1.default.equal(merged[0].id, 'g-active');
    strict_1.default.equal(merged[0].clockHard, true);
    strict_1.default.equal(merged[0].numMoves, 7);
    strict_1.default.equal(merged[0].seen, 5);
    strict_1.default.equal(merged[0].lastChat, 6);
    strict_1.default.equal(merged[1].id, 'g-done');
    strict_1.default.equal(merged[1].gameEnded, 55);
    strict_1.default.equal(merged[1].seen, 2);
    strict_1.default.equal(merged[1].lastChat, 3);
});
(0, node_test_1.test)('mergeDashboardGames omits completed when not in RECENTCOMPLETED#', () => {
    const otherCompleted = {
        pk: 'RECENTCOMPLETED#u1',
        sk: 'g-other',
        metaGame: 'saltire',
        players: [{ id: 'u1', name: 'A' }],
        clockHard: false,
        toMove: '',
        lastMoveTime: 40,
    };
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [otherCompleted], new Map());
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].id, 'g-other');
});
(0, node_test_1.test)('mergeDashboardGames returns empty when indexes are empty', () => {
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], [], new Map());
    strict_1.default.equal(merged.length, 0);
});
(0, node_test_1.test)('mergeDashboardGames does not duplicate when same id in both indexes', () => {
    const overlapCompleted = {
        ...completedRow,
        sk: 'g-active',
        toMove: '',
    };
    const merged = (0, dashboardGames_1.mergeDashboardGames)([activeRow], [overlapCompleted], new Map());
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].id, 'g-active');
    strict_1.default.equal(merged[0].toMove, '0');
});
(0, node_test_1.test)('listActiveGameKeys returns only active CURRENTGAMES# rows', async () => {
    const completedActiveRow = {
        ...activeRow,
        sk: 'g-done-active',
        toMove: '',
    };
    const client = {
        send: async () => ({
            Items: [activeRow, completedActiveRow],
        }),
    };
    const keys = await (0, dashboardGames_1.listActiveGameKeys)(client, 'table', 'u1');
    strict_1.default.deepEqual(keys, [{ metaGame: 'saltire', id: 'g-active' }]);
});
