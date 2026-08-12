"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const recentCompletedGames_1 = require("../lib/recentCompletedGames");
(0, node_test_1.test)('recentCompletedRowToGame maps completed summary fields', () => {
    const game = (0, recentCompletedGames_1.recentCompletedRowToGame)({
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
    strict_1.default.equal(game.id, 'g1');
    strict_1.default.equal(game.toMove, '');
    strict_1.default.equal(game.numMoves, 12);
    strict_1.default.equal(game.gameEnded, 101);
    strict_1.default.deepEqual(game.winner, [1]);
});
(0, node_test_1.test)('shouldBeOnCompletedDashboard keeps unseen completed games', () => {
    strict_1.default.equal((0, recentCompletedGames_1.shouldBeOnCompletedDashboard)({ toMove: '' }), true);
    strict_1.default.equal((0, recentCompletedGames_1.shouldBeOnCompletedDashboard)({ toMove: '', seen: undefined }), true);
});
(0, node_test_1.test)('shouldBeOnCompletedDashboard evicts stale seen when lastChat is not newer', () => {
    const now = Date.now();
    const seen = now - recentCompletedGames_1.COMPLETED_DASHBOARD_RETENTION_MS - 1000;
    strict_1.default.equal((0, recentCompletedGames_1.shouldBeOnCompletedDashboard)({ toMove: '', seen, lastChat: seen }, now), false);
});
(0, node_test_1.test)('shouldBeOnCompletedDashboard keeps games with chat after seen', () => {
    const now = Date.now();
    const seen = now - recentCompletedGames_1.COMPLETED_DASHBOARD_RETENTION_MS - 1000;
    strict_1.default.equal((0, recentCompletedGames_1.shouldBeOnCompletedDashboard)({ toMove: '', seen, lastChat: seen + 1 }, now), true);
});
