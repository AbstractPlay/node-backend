"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const batchRatings_1 = require("../lib/batchRatings");
const summaryRatings_1 = require("../lib/summaryRatings");
const fixture = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, 'fixtures', 'batch-ratings.json'), 'utf8'));
(0, node_test_1.describe)('loadSummaryRatingsHighest', () => {
    (0, node_test_1.before)(() => {
        (0, summaryRatings_1.setSummaryRatingsHighestForTests)(fixture.highest);
    });
    (0, node_test_1.after)(() => {
        (0, summaryRatings_1.clearSummaryRatingsCacheForTests)();
    });
    (0, node_test_1.it)('returns cached highest rows for tournament seeding', async () => {
        const highest = await (0, summaryRatings_1.loadSummaryRatingsHighest)();
        const players = [{ playerid: 'bob' }, { playerid: 'alice' }];
        (0, batchRatings_1.assignTournamentPlayerRatings)(players, highest, 'Chess', []);
        players.sort((a, b) => b.rating - a.rating);
        strict_1.default.equal(players[0]?.playerid, 'alice');
        strict_1.default.equal(players[0]?.rating, 1200);
    });
});
