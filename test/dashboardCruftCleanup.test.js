"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const dashboardCruftCleanup_1 = require("../lib/dashboardCruftCleanup");
const TABLE = 'test-table';
const USER_ID = 'user-1';
const GAME_STALE = 'stale-game';
const GAME_ACTIVE = 'active-game';
const GAME_ORPHAN = 'orphan-overlay';
function key(pk, sk) {
    return `${pk}:${sk}`;
}
function makeClient(store) {
    return {
        send: async (command) => {
            const input = command.input;
            if (command.constructor.name === 'QueryCommand') {
                const pk = input.ExpressionAttributeValues[':pk'];
                const items = [...store.values()].filter(item => item.pk === pk);
                return { Items: items.map(item => ({ ...item })) };
            }
            if (command.constructor.name === 'DeleteCommand') {
                const itemKey = input.Key;
                store.delete(key(itemKey.pk, itemKey.sk));
                return {};
            }
            throw new Error(`Unhandled ${command.constructor.name}`);
        },
    };
}
(0, node_test_1.describe)('cleanupUserDashboardCruft', () => {
    (0, node_test_1.it)('deletes all RECENTCOMPLETED# rows and orphan USERGAME# overlays', async () => {
        const store = new Map([
            [key(`CURRENTGAMES#${USER_ID}`, GAME_ACTIVE), {
                    pk: `CURRENTGAMES#${USER_ID}`,
                    sk: GAME_ACTIVE,
                    metaGame: 'saltire',
                    toMove: '0',
                }],
            [key(`RECENTCOMPLETED#${USER_ID}`, GAME_STALE), {
                    pk: `RECENTCOMPLETED#${USER_ID}`,
                    sk: GAME_STALE,
                    metaGame: 'saltire',
                    toMove: '',
                    lastMoveTime: 1,
                    players: [],
                    clockHard: false,
                }],
            [key(`USERGAME#${USER_ID}`, GAME_STALE), {
                    pk: `USERGAME#${USER_ID}`,
                    sk: GAME_STALE,
                    seen: Date.parse('2026-07-01T12:00:00.000Z'),
                }],
            [key(`USERGAME#${USER_ID}`, GAME_ORPHAN), {
                    pk: `USERGAME#${USER_ID}`,
                    sk: GAME_ORPHAN,
                    seen: 1,
                }],
        ]);
        const stats = await (0, dashboardCruftCleanup_1.cleanupUserDashboardCruft)(makeClient(store), TABLE, USER_ID);
        strict_1.default.equal(stats.recentCompletedDeleted, 1);
        strict_1.default.equal(stats.userGameDeleted, 2);
        strict_1.default.equal(store.has(key(`RECENTCOMPLETED#${USER_ID}`, GAME_STALE)), false);
        strict_1.default.equal(store.has(key(`USERGAME#${USER_ID}`, GAME_STALE)), false);
        strict_1.default.equal(store.has(key(`USERGAME#${USER_ID}`, GAME_ORPHAN)), false);
        strict_1.default.equal(store.has(key(`CURRENTGAMES#${USER_ID}`, GAME_ACTIVE)), true);
    });
});
