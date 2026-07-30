"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const commentAuth_1 = require("../lib/commentAuth");
const TABLE = 'abstract-play-test';
const META = 'emu';
const GAME_ID = 'd70ccde2-3c93-4ad5-b71f-f5c8f6015500';
const PLAYER_A = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const PLAYER_B = '5448f4f8-90d1-70c3-1cb9-3ad42904e413';
const SPECTATOR = 'a82c4aa8-7d43-4661-b027-17afd1d1586f';
const ADMIN = 'admin-user-id';
function itemKey(item) {
    return `${item.pk}:${item.sk}`;
}
function activeGame(players) {
    return {
        pk: 'GAME',
        sk: (0, commentAuth_1.gameRecordSk)(META, 0, GAME_ID),
        id: GAME_ID,
        metaGame: META,
        players,
    };
}
function completedGame(players) {
    return {
        pk: 'GAME',
        sk: (0, commentAuth_1.gameRecordSk)(META, 1, GAME_ID),
        id: GAME_ID,
        metaGame: META,
        players,
    };
}
function userRecord(id, admin) {
    return {
        pk: 'USER',
        sk: id,
        id,
        admin,
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
(0, node_test_1.test)('gameRecordSk formats active and completed keys', () => {
    strict_1.default.equal((0, commentAuth_1.gameRecordSk)('emu', 0, 'abc'), 'emu#0#abc');
    strict_1.default.equal((0, commentAuth_1.gameRecordSk)('emu', 1, 'abc'), 'emu#1#abc');
});
(0, node_test_1.test)('isGameParticipant matches player ids', () => {
    const game = { players: [{ id: PLAYER_A }, { id: PLAYER_B }] };
    strict_1.default.equal((0, commentAuth_1.isGameParticipant)(game, PLAYER_A), true);
    strict_1.default.equal((0, commentAuth_1.isGameParticipant)(game, SPECTATOR), false);
});
(0, node_test_1.test)('empty userid skips auth (system messages)', async () => {
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, '', META, GAME_ID);
    strict_1.default.deepEqual(result, { ok: true });
});
(0, node_test_1.test)('participant on active game is allowed', async () => {
    store.set(itemKey(activeGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ])), activeGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ]));
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, PLAYER_A, META, GAME_ID);
    strict_1.default.deepEqual(result, { ok: true });
});
(0, node_test_1.test)('non-participant non-admin on active game is denied (Chris attack scenario)', async () => {
    store.set(itemKey(activeGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ])), activeGame([
        { id: PLAYER_A, name: 'mason' },
        { id: PLAYER_B, name: 'Kapena' },
    ]));
    store.set(itemKey(userRecord(SPECTATOR, false)), userRecord(SPECTATOR, false));
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /participants and admins/);
    }
});
(0, node_test_1.test)('admin non-participant on active game is allowed', async () => {
    store.set(itemKey(activeGame([{ id: PLAYER_A, name: 'mason' }])), activeGame([{ id: PLAYER_A, name: 'mason' }]));
    store.set(itemKey(userRecord(ADMIN, true)), userRecord(ADMIN, true));
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, ADMIN, META, GAME_ID);
    strict_1.default.deepEqual(result, { ok: true });
});
(0, node_test_1.test)('missing game record is denied', async () => {
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, SPECTATOR, META, GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /not found/i);
    }
});
(0, node_test_1.test)('completed game only (#1#) is denied for submit_comment', async () => {
    store.set(itemKey(completedGame([{ id: PLAYER_A, name: 'mason' }])), completedGame([{ id: PLAYER_A, name: 'mason' }]));
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, PLAYER_A, META, GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /save_exploration/);
    }
});
(0, node_test_1.test)('wrong metaGame with no matching record is denied', async () => {
    store.set(itemKey(activeGame([{ id: PLAYER_A, name: 'mason' }])), activeGame([{ id: PLAYER_A, name: 'mason' }]));
    const result = await (0, commentAuth_1.checkInGameCommentAuth)(client, TABLE, PLAYER_A, 'wrong-meta', GAME_ID);
    strict_1.default.equal(result.ok, false);
    if (!result.ok) {
        strict_1.default.match(result.message, /not found/i);
    }
});
