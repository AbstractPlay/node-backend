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
const fixture = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, 'fixtures', 'batch-ratings.json'), 'utf8'));
(0, node_test_1.describe)('batchRatingGameLabel', () => {
    (0, node_test_1.it)('labels no variants', () => {
        strict_1.default.equal((0, batchRatings_1.batchRatingGameLabel)('Chess', []), 'Chess (no variants)');
    });
    (0, node_test_1.it)('labels sorted variant UIDs', () => {
        strict_1.default.equal((0, batchRatings_1.batchRatingGameLabel)('Go', ['handicap', '9x9']), 'Go (9x9|handicap)');
    });
});
(0, node_test_1.describe)('defaultGlickoPrior', () => {
    (0, node_test_1.it)('uses 1200/350 start aligned with batch Elo', () => {
        const prior = (0, batchRatings_1.defaultGlickoPrior)();
        strict_1.default.equal(prior.rating, batchRatings_1.GLICKO_RATING_START);
        strict_1.default.equal(prior.rd, batchRatings_1.GLICKO_RD_START);
        strict_1.default.equal(prior.ratingLow, batchRatings_1.GLICKO_PRIOR_RATING_LOW);
    });
});
(0, node_test_1.describe)('lookupBatchRating', () => {
    (0, node_test_1.it)('finds an existing row', () => {
        const row = (0, batchRatings_1.lookupBatchRating)(fixture.highest, 'Chess', [], 'alice');
        strict_1.default.equal(row.user, 'alice');
        strict_1.default.equal(row.glicko?.ratingLow, 1200);
    });
    (0, node_test_1.it)('returns prior for missing user', () => {
        const row = (0, batchRatings_1.lookupBatchRating)(fixture.highest, 'Chess', [], 'unknown');
        strict_1.default.equal(row.glicko?.rating, 1200);
        strict_1.default.equal(row.glicko?.ratingLow, 500);
    });
});
(0, node_test_1.describe)('compareBatchRatings', () => {
    (0, node_test_1.it)('sorts by ratingLow descending', () => {
        const sorted = [...fixture.highest.filter((r) => r.game === 'Chess (no variants)')].sort(batchRatings_1.compareBatchRatings);
        strict_1.default.equal(sorted[0]?.user, 'alice');
        strict_1.default.equal(sorted[1]?.user, 'bob');
    });
});
(0, node_test_1.describe)('assignTournamentPlayerRatings', () => {
    (0, node_test_1.it)('orders players by glicko ratingLow descending', () => {
        const players = [
            { playerid: 'bob' },
            { playerid: 'alice' },
            { playerid: 'unknown' },
        ];
        (0, batchRatings_1.assignTournamentPlayerRatings)(players, fixture.highest, 'Chess', []);
        players.sort((a, b) => b.rating - a.rating);
        strict_1.default.deepEqual(players.map((p) => p.playerid), ['alice', 'bob', 'unknown']);
        strict_1.default.equal(players[0]?.rating, 1200);
        strict_1.default.equal(players[1]?.rating, 1090);
        strict_1.default.equal(players[2]?.rating, batchRatings_1.GLICKO_PRIOR_RATING_LOW);
    });
});
