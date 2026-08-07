"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const commentAuth_1 = require("../lib/commentAuth");
const playerGameMarks_1 = require("../lib/playerGameMarks");
const TABLE = 'abstract-play-test';
const META = 'emu';
const GAME_ID = 'd70ccde2-3c93-4ad5-b71f-f5c8f6015500';
const PLAYER_A = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const PLAYER_B = '5448f4f8-90d1-70c3-1cb9-3ad42904e413';
const SPECTATOR = 'a82c4aa8-7d43-4661-b027-17afd1d1586f';
function itemKey(item) {
    return `${item.pk}:${item.sk}`;
}
function activeGame(players) {
    return {
        pk: 'GAME',
        sk: (0, commentAuth_1.gameRecordSk)(META, 0, GAME_ID),
        id: GAME_ID,
        metaGame: META,
        numPlayers: players.length,
        players,
        clockHard: false,
        toMove: '0',
        lastMoveTime: Date.now(),
        state: '',
    };
}
function completedGame(players, numMoves = 5) {
    return {
        pk: 'GAME',
        sk: (0, commentAuth_1.gameRecordSk)(META, 1, GAME_ID),
        id: GAME_ID,
        metaGame: META,
        numPlayers: players.length,
        players,
        clockHard: false,
        toMove: '',
        lastMoveTime: Date.now(),
        numMoves,
        gameStarted: 1,
        gameEnded: 2,
        state: '',
    };
}
function createMockDocClient(store) {
    return {
        async send(command) {
            if (command instanceof lib_dynamodb_1.GetCommand) {
                const { pk, sk } = command.input.Key;
                const item = store.get(`${pk}:${sk}`);
                return { Item: item };
            }
            if (command instanceof lib_dynamodb_1.PutCommand) {
                const item = command.input.Item;
                store.set(itemKey(item), { ...item });
                return {};
            }
            if (command instanceof lib_dynamodb_1.DeleteCommand) {
                const { pk, sk } = command.input.Key;
                store.delete(`${pk}:${sk}`);
                return {};
            }
            if (command instanceof lib_dynamodb_1.QueryCommand) {
                const pk = command.input.ExpressionAttributeValues[':pk'];
                const skPrefix = command.input.ExpressionAttributeValues[':prefix'];
                const items = [...store.values()].filter(item => {
                    if (item.pk !== pk) {
                        return false;
                    }
                    if (skPrefix !== undefined) {
                        return String(item.sk).startsWith(skPrefix);
                    }
                    return true;
                });
                if (command.input.Select === 'COUNT') {
                    return { Count: items.length };
                }
                return { Items: items };
            }
            if (command instanceof lib_dynamodb_1.UpdateCommand) {
                const { pk, sk } = command.input.Key;
                const key = `${pk}:${sk}`;
                const existing = store.get(key) ?? { pk, sk };
                const values = command.input.ExpressionAttributeValues;
                if (command.input.UpdateExpression?.includes('lastChat')) {
                    existing.lastChat = values[':lc'];
                }
                if (command.input.UpdateExpression?.includes('seen')) {
                    existing.seen = values[':seen'];
                }
                store.set(key, existing);
                return {};
            }
            throw new Error('Unsupported command');
        },
    };
}
let store;
let client;
(0, node_test_1.beforeEach)(() => {
    store = new Map();
    client = createMockDocClient(store);
});
(0, node_test_1.afterEach)(() => {
    store.clear();
});
(0, node_test_1.test)('participant cannot watch own game', async () => {
    const game = activeGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ]);
    store.set(itemKey(game), game);
    const result = await (0, playerGameMarks_1.watchGame)(client, TABLE, PLAYER_A, META, GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /cannot watch/i);
    }
});
(0, node_test_1.test)('non-participant can watch active game', async () => {
    const game = activeGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ]);
    store.set(itemKey(game), game);
    const result = await (0, playerGameMarks_1.watchGame)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, true);
    strict_1.default.ok(store.has(`WATCHED#${SPECTATOR}:${GAME_ID}`));
    strict_1.default.ok(store.has(`GAMEWATCHERS#${GAME_ID}:${SPECTATOR}`));
});
(0, node_test_1.test)('non-participant can watch completed game', async () => {
    const game = completedGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ]);
    store.set(itemKey(game), game);
    const result = await (0, playerGameMarks_1.watchGame)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, true);
});
(0, node_test_1.test)('highlight requires participation', async () => {
    const game = activeGame([{ id: PLAYER_A, name: 'mason' }, { id: PLAYER_B, name: 'Kapena' }]);
    store.set(itemKey(game), game);
    const denied = await (0, playerGameMarks_1.highlightGame)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(denied.ok, false);
    const allowed = await (0, playerGameMarks_1.highlightGame)(client, TABLE, PLAYER_A, META, GAME_ID);
    strict_1.default.equal(allowed.ok, true);
    strict_1.default.ok(store.has(`HIGHLIGHT#${PLAYER_A}:${META}#${GAME_ID}`));
});
(0, node_test_1.test)('non-participant can recommend completed game', async () => {
    store.set(itemKey(userRecord(SPECTATOR, 'spectator')), userRecord(SPECTATOR, 'spectator'));
    const game = completedGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ], 5);
    store.set(itemKey(game), game);
    const result = await (0, playerGameMarks_1.recommendGame)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, true);
    strict_1.default.ok(store.has(`REPRESENTATIVE#${META}:${SPECTATOR}#${GAME_ID}`));
    strict_1.default.ok(store.has(`PLAYER#${SPECTATOR}:REPRESENTATIVE#${META}#${GAME_ID}`));
});
function userRecord(id, name) {
    return { pk: 'USER', sk: id, id, name };
}
(0, node_test_1.test)('recommend enforces two per metaGame', async () => {
    store.set(itemKey(userRecord(SPECTATOR, 'spectator')), userRecord(SPECTATOR, 'spectator'));
    const otherId1 = 'other-game-1';
    const otherId2 = 'other-game-2';
    store.set(itemKey({
        pk: `PLAYER#${SPECTATOR}`,
        sk: `REPRESENTATIVE#${META}#${otherId1}`,
        metaGame: META,
        gameId: otherId1,
    }), {
        pk: `PLAYER#${SPECTATOR}`,
        sk: `REPRESENTATIVE#${META}#${otherId1}`,
    });
    store.set(itemKey({
        pk: `PLAYER#${SPECTATOR}`,
        sk: `REPRESENTATIVE#${META}#${otherId2}`,
    }), {
        pk: `PLAYER#${SPECTATOR}`,
        sk: `REPRESENTATIVE#${META}#${otherId2}`,
    });
    const game = completedGame([{ id: PLAYER_A, name: 'mason' }, { id: PLAYER_B, name: 'Kapena' }], 5);
    store.set(itemKey(game), game);
    const count = await (0, playerGameMarks_1.countUserRecommendationsForMetaGame)(client, TABLE, SPECTATOR, META);
    strict_1.default.equal(count, 2);
    const result = await (0, playerGameMarks_1.recommendGame)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /only recommend 2/i);
    }
});
(0, node_test_1.test)('recommend rejects in-progress game', async () => {
    store.set(itemKey(userRecord(SPECTATOR, 'spectator')), userRecord(SPECTATOR, 'spectator'));
    const game = activeGame([{ id: PLAYER_A, name: 'mason' }, { id: PLAYER_B, name: 'Kapena' }]);
    store.set(itemKey(game), game);
    const result = await (0, playerGameMarks_1.recommendGame)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /completed/i);
    }
});
(0, node_test_1.test)('recommend rejects too-short completed game', () => {
    const source = {
        id: GAME_ID,
        metaGame: META,
        players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
        clockHard: false,
        toMove: '',
        lastMoveTime: 1,
        numPlayers: 2,
        numMoves: 2,
    };
    const summary = (0, playerGameMarks_1.buildGameSummary)(source);
    strict_1.default.equal(summary.gameEnded, 1);
    strict_1.default.equal((0, playerGameMarks_1.isQualityCompletedGame)(source, summary), false);
});
(0, node_test_1.test)('buildGameSummary derives gameEnded for completed game when numMoves already set', () => {
    const source = {
        id: GAME_ID,
        metaGame: META,
        players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
        clockHard: false,
        toMove: '',
        lastMoveTime: 1234567890,
        numPlayers: 2,
        numMoves: 41,
    };
    const summary = (0, playerGameMarks_1.buildGameSummary)(source);
    strict_1.default.equal(summary.gameEnded, 1234567890);
    strict_1.default.equal(summary.toMove, undefined);
});
(0, node_test_1.test)('buildGameSummary preserves source gameEnded when present', () => {
    const source = {
        id: GAME_ID,
        metaGame: META,
        players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
        clockHard: false,
        toMove: '',
        lastMoveTime: 100,
        gameEnded: 999,
        numPlayers: 2,
        numMoves: 10,
    };
    const summary = (0, playerGameMarks_1.buildGameSummary)(source);
    strict_1.default.equal(summary.gameEnded, 999);
});
(0, node_test_1.test)('buildGameSummary does not set gameEnded for in-progress game', () => {
    const source = {
        id: GAME_ID,
        metaGame: META,
        players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
        clockHard: false,
        toMove: '0',
        lastMoveTime: 1234567890,
        numPlayers: 2,
        numMoves: 5,
    };
    const summary = (0, playerGameMarks_1.buildGameSummary)(source);
    strict_1.default.equal(summary.gameEnded, undefined);
    strict_1.default.equal(summary.toMove, '0');
});
(0, node_test_1.test)('updateLastChatForWatchers sets lastChat without seen for non-commenter', async () => {
    store.set(itemKey({
        pk: `GAMEWATCHERS#${GAME_ID}`,
        sk: SPECTATOR,
    }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: SPECTATOR });
    store.set(itemKey({
        pk: `WATCHED#${SPECTATOR}`,
        sk: GAME_ID,
        id: GAME_ID,
        metaGame: META,
    }), {
        pk: `WATCHED#${SPECTATOR}`,
        sk: GAME_ID,
        id: GAME_ID,
        metaGame: META,
    });
    await (0, playerGameMarks_1.updateLastChatForWatchers)(client, TABLE, GAME_ID, PLAYER_A);
    const watched = store.get(`WATCHED#${SPECTATOR}:${GAME_ID}`);
    strict_1.default.ok(watched?.lastChat);
    strict_1.default.equal(watched?.seen, undefined);
});
(0, node_test_1.test)('countGameWatchers returns watcher index size', async () => {
    store.set(itemKey({
        pk: `GAMEWATCHERS#${GAME_ID}`,
        sk: SPECTATOR,
    }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: SPECTATOR });
    store.set(itemKey({
        pk: `GAMEWATCHERS#${GAME_ID}`,
        sk: PLAYER_A,
    }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: PLAYER_A });
    const count = await (0, playerGameMarks_1.countGameWatchers)(client, TABLE, GAME_ID);
    strict_1.default.equal(count, 2);
});
(0, node_test_1.test)('updateLastChatForWatchers sets seen for commenter watcher', async () => {
    store.set(itemKey({
        pk: `GAMEWATCHERS#${GAME_ID}`,
        sk: SPECTATOR,
    }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: SPECTATOR });
    store.set(itemKey({
        pk: `WATCHED#${SPECTATOR}`,
        sk: GAME_ID,
        id: GAME_ID,
    }), {
        pk: `WATCHED#${SPECTATOR}`,
        sk: GAME_ID,
        id: GAME_ID,
    });
    await (0, playerGameMarks_1.updateLastChatForWatchers)(client, TABLE, GAME_ID, SPECTATOR);
    const watched = store.get(`WATCHED#${SPECTATOR}:${GAME_ID}`);
    strict_1.default.ok(watched?.lastChat);
    strict_1.default.ok(watched?.seen);
});
