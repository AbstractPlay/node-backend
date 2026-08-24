"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const touchUserLastSeen_1 = require("../lib/touchUserLastSeen");
const TABLE = 'test-table';
const USER_ID = 'user-1';
const NOW = Date.parse('2026-08-24T12:00:00.000Z');
function key(pk, sk) {
    return `${pk}:${sk}`;
}
function makeClient(store) {
    return {
        send: async (command) => {
            const input = command.input;
            if (command.constructor.name === 'UpdateCommand') {
                const itemKey = input.Key;
                const item = store.get(key(itemKey.pk, itemKey.sk)) ?? {
                    pk: itemKey.pk,
                    sk: itemKey.sk,
                };
                const values = input.ExpressionAttributeValues;
                const touchBefore = values[':touchBefore'];
                const existing = item.lastSeen;
                if (existing !== undefined && existing >= touchBefore) {
                    const err = new Error('conditional failed');
                    err.name = 'ConditionalCheckFailedException';
                    throw err;
                }
                item.lastSeen = values[':now'];
                store.set(key(itemKey.pk, itemKey.sk), item);
                return {};
            }
            if (command.constructor.name === 'BatchGetCommand') {
                const requestItems = input.RequestItems;
                const keys = requestItems[TABLE]?.Keys ?? [];
                const items = keys
                    .map(k => store.get(key(k.pk, k.sk)))
                    .filter((item) => item !== undefined)
                    .map(item => ({ ...item }));
                return { Responses: { [TABLE]: items } };
            }
            throw new Error(`Unhandled ${command.constructor.name}`);
        },
    };
}
(0, node_test_1.describe)('touchUserLastSeen', () => {
    (0, node_test_1.it)('writes lastSeen when absent', async () => {
        const store = new Map();
        const touched = await (0, touchUserLastSeen_1.touchUserLastSeen)(makeClient(store), TABLE, USER_ID, NOW);
        strict_1.default.equal(touched, true);
        strict_1.default.equal(store.get(key('USERS', USER_ID)).lastSeen, NOW);
    });
    (0, node_test_1.it)('skips when lastSeen is recent', async () => {
        const store = new Map([
            [key('USERS', USER_ID), {
                    pk: 'USERS',
                    sk: USER_ID,
                    lastSeen: NOW - 1000,
                }],
        ]);
        const touched = await (0, touchUserLastSeen_1.touchUserLastSeen)(makeClient(store), TABLE, USER_ID, NOW);
        strict_1.default.equal(touched, false);
        strict_1.default.equal(store.get(key('USERS', USER_ID)).lastSeen, NOW - 1000);
    });
    (0, node_test_1.it)('writes when lastSeen is older than touch interval', async () => {
        const store = new Map([
            [key('USERS', USER_ID), {
                    pk: 'USERS',
                    sk: USER_ID,
                    lastSeen: NOW - touchUserLastSeen_1.TOUCH_USER_LAST_SEEN_INTERVAL_MS - 1,
                }],
        ]);
        const touched = await (0, touchUserLastSeen_1.touchUserLastSeen)(makeClient(store), TABLE, USER_ID, NOW);
        strict_1.default.equal(touched, true);
        strict_1.default.equal(store.get(key('USERS', USER_ID)).lastSeen, NOW);
    });
});
(0, node_test_1.describe)('getUsersLastSeen', () => {
    (0, node_test_1.it)('returns lastSeen values for requested users', async () => {
        const store = new Map([
            [key('USERS', 'u1'), { pk: 'USERS', sk: 'u1', lastSeen: 100 }],
            [key('USERS', 'u2'), { pk: 'USERS', sk: 'u2' }],
        ]);
        const map = await (0, touchUserLastSeen_1.getUsersLastSeen)(makeClient(store), TABLE, ['u1', 'u2', 'u1']);
        strict_1.default.equal(map.get('u1'), 100);
        strict_1.default.equal(map.get('u2'), undefined);
    });
});
