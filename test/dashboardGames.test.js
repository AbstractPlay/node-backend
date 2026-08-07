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
            seen: 99,
        },
        completedLegacy,
    ];
    const overlays = new Map([
        ['g-active', { seen: 5, lastChat: 6 }],
        ['g-done', { seen: 2 }],
    ]);
    const merged = (0, dashboardGames_1.mergeDashboardGames)([activeRow], overlays, legacy);
    strict_1.default.equal(merged.length, 2);
    strict_1.default.equal(merged[0].id, 'g-active');
    strict_1.default.equal(merged[0].clockHard, true);
    strict_1.default.equal(merged[0].seen, 5);
    strict_1.default.equal(merged[0].lastChat, 6);
    strict_1.default.equal(merged[1].id, 'g-done');
    strict_1.default.equal(merged[1].seen, 2);
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
    const merged = (0, dashboardGames_1.mergeDashboardGames)([], overlays, legacy);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].seen, 7);
});
