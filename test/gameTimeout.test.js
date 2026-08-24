"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const gameTimeout_1 = require("../lib/gameTimeout");
const TABLE = 'test-table';
const NOW = Date.parse('2026-08-24T12:00:00.000Z');
function activeGame(overrides = {}) {
    return {
        id: 'g1',
        metaGame: 'saltire',
        players: [
            { id: 'p0', name: 'Alice', time: 60000 },
            { id: 'p1', name: 'Bob', time: 60000 },
        ],
        clockHard: true,
        toMove: '0',
        lastMoveTime: NOW - 120000,
        ...overrides,
    };
}
function makeClient(onUpdate) {
    return {
        send: async (command) => {
            if (command.constructor.name === 'UpdateCommand') {
                await onUpdate?.(command.input);
                return {};
            }
            throw new Error(`Unhandled ${command.constructor.name}`);
        },
    };
}
(0, node_test_1.describe)('checkAndProcessGameTimeout', () => {
    (0, node_test_1.it)('processes a timed-out turn-based game', async () => {
        const game = activeGame();
        let timelossCalls = 0;
        const timeloss = async () => {
            timelossCalls += 1;
        };
        const result = await (0, gameTimeout_1.checkAndProcessGameTimeout)(game, {
            client: makeClient(),
            tableName: TABLE,
            timeloss,
            now: () => NOW,
        });
        strict_1.default.equal(result.processed, true);
        strict_1.default.equal(result.game.toMove, '');
        strict_1.default.equal(timelossCalls, 1);
    });
    (0, node_test_1.it)('skips when clock has not expired', async () => {
        const game = activeGame({ lastMoveTime: NOW - 1000 });
        let timelossCalls = 0;
        const result = await (0, gameTimeout_1.checkAndProcessGameTimeout)(game, {
            client: makeClient(),
            tableName: TABLE,
            timeloss: async () => { timelossCalls += 1; },
            now: () => NOW,
        });
        strict_1.default.equal(result.processed, false);
        strict_1.default.equal(timelossCalls, 0);
    });
    (0, node_test_1.it)('does not call timeloss on conditional check failure', async () => {
        const game = activeGame();
        let timelossCalls = 0;
        const client = makeClient(async () => {
            const err = new Error('conditional failed');
            err.name = 'ConditionalCheckFailedException';
            throw err;
        });
        const result = await (0, gameTimeout_1.checkAndProcessGameTimeout)(game, {
            client: client,
            tableName: TABLE,
            timeloss: async () => { timelossCalls += 1; },
            now: () => NOW,
        });
        strict_1.default.equal(result.processed, false);
        strict_1.default.equal(result.game.toMove, '');
        strict_1.default.equal(timelossCalls, 0);
    });
    (0, node_test_1.it)('processes simultaneous clock timeout for the most overdue player', async () => {
        const game = activeGame({
            toMove: [true, true],
            players: [
                { id: 'p0', name: 'Alice', time: 30000 },
                { id: 'p1', name: 'Bob', time: 10000 },
            ],
            lastMoveTime: NOW - 50000,
        });
        let timedOutPlayer = -1;
        const timeloss = async (_check, player) => {
            timedOutPlayer = player;
        };
        const result = await (0, gameTimeout_1.checkAndProcessGameTimeout)(game, {
            client: makeClient(),
            tableName: TABLE,
            timeloss,
            now: () => NOW,
        });
        strict_1.default.equal(result.processed, true);
        strict_1.default.equal(timedOutPlayer, 1);
    });
});
(0, node_test_1.describe)('sweepUserGameTimeouts', () => {
    (0, node_test_1.it)('returns updated games after sweep', async () => {
        const games = [
            activeGame({ id: 'g1' }),
            activeGame({ id: 'g2', clockHard: false }),
        ];
        let timelossCalls = 0;
        const swept = await (0, gameTimeout_1.sweepUserGameTimeouts)(games, {
            client: makeClient(),
            tableName: TABLE,
            timeloss: async () => { timelossCalls += 1; },
            now: () => NOW,
        });
        strict_1.default.equal(swept.length, 2);
        strict_1.default.equal(swept[0].toMove, '');
        strict_1.default.equal(swept[1].toMove, '0');
        strict_1.default.equal(timelossCalls, 1);
    });
});
