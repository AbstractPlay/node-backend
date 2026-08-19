"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const ratings_1 = require("../lib/ratings");
(0, node_test_1.test)('getRatingK follows backend tiers', () => {
    strict_1.default.equal((0, ratings_1.getRatingK)(0), 40);
    strict_1.default.equal((0, ratings_1.getRatingK)(9), 40);
    strict_1.default.equal((0, ratings_1.getRatingK)(10), 30);
    strict_1.default.equal((0, ratings_1.getRatingK)(19), 30);
    strict_1.default.equal((0, ratings_1.getRatingK)(20), 25);
    strict_1.default.equal((0, ratings_1.getRatingK)(39), 25);
    strict_1.default.equal((0, ratings_1.getRatingK)(40), 20);
});
(0, node_test_1.test)('updateTwoPlayerRatings matches backend win calculation', () => {
    const p1 = { rating: 1500, N: 15, wins: 10, draws: 2 };
    const p2 = { rating: 1400, N: 5, wins: 3, draws: 1 };
    const [newP1, newP2] = (0, ratings_1.updateTwoPlayerRatings)(p1, p2, 1);
    const expected = (0, ratings_1.expectedScorePlayer1)(p1.rating, p2.rating);
    strict_1.default.equal(newP1.rating, p1.rating + (0, ratings_1.getRatingK)(p1.N) * (1 - expected));
    strict_1.default.equal(newP2.rating, p2.rating + (0, ratings_1.getRatingK)(p2.N) * (expected - 1));
    strict_1.default.equal(newP1.N, p1.N + 1);
    strict_1.default.equal(newP2.N, p2.N + 1);
    strict_1.default.equal(newP1.wins, p1.wins + 1);
    strict_1.default.equal(newP2.wins, p2.wins);
    strict_1.default.equal(newP1.draws, p1.draws);
    strict_1.default.equal(newP2.draws, p2.draws);
});
(0, node_test_1.test)('updateTwoPlayerRatings handles draws', () => {
    const p1 = { ...ratings_1.DEFAULT_PLAYER_RATING, rating: 1200, N: 0 };
    const p2 = { ...ratings_1.DEFAULT_PLAYER_RATING, rating: 1200, N: 0 };
    const [newP1, newP2] = (0, ratings_1.updateTwoPlayerRatings)(p1, p2, (0, ratings_1.player1ScoreFromResult)('draw'));
    strict_1.default.equal(newP1.rating, 1200);
    strict_1.default.equal(newP2.rating, 1200);
    strict_1.default.equal(newP1.draws, 1);
    strict_1.default.equal(newP2.draws, 1);
});
