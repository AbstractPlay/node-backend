"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const dashboardEviction_1 = require("../lib/dashboardEviction");
const TABLE = 'test-table';
const USER_ID = 'user-1';
function key(pk, sk) {
    return `${pk}:${sk}`;
}
function makeClient(store) {
    return {
        send: async (command) => {
            const input = command.input;
            if (command.constructor.name === 'DeleteCommand') {
                const itemKey = input.Key;
                store.delete(key(itemKey.pk, itemKey.sk));
                return {};
            }
            throw new Error(`Unhandled ${command.constructor.name}`);
        },
    };
}
(0, node_test_1.describe)('removeDashboardGameMembership', () => {
    (0, node_test_1.it)('deletes RECENTCOMPLETED# and USERGAME# for each game id', async () => {
        const store = new Map([
            [key(`RECENTCOMPLETED#${USER_ID}`, 'g1'), { pk: `RECENTCOMPLETED#${USER_ID}`, sk: 'g1' }],
            [key(`USERGAME#${USER_ID}`, 'g1'), { pk: `USERGAME#${USER_ID}`, sk: 'g1' }],
            [key(`RECENTCOMPLETED#${USER_ID}`, 'g2'), { pk: `RECENTCOMPLETED#${USER_ID}`, sk: 'g2' }],
            [key(`USERGAME#${USER_ID}`, 'g2'), { pk: `USERGAME#${USER_ID}`, sk: 'g2' }],
        ]);
        const stats = await (0, dashboardEviction_1.removeDashboardGameMembership)(makeClient(store), TABLE, USER_ID, ['g1', 'g2']);
        strict_1.default.equal(stats.recentCompletedDeleted, 2);
        strict_1.default.equal(stats.userGameDeleted, 2);
        strict_1.default.equal(store.size, 0);
    });
    (0, node_test_1.it)('is idempotent when rows are already absent', async () => {
        const store = new Map();
        const stats = await (0, dashboardEviction_1.removeDashboardGameMembership)(makeClient(store), TABLE, USER_ID, ['missing']);
        strict_1.default.equal(stats.recentCompletedDeleted, 1);
        strict_1.default.equal(stats.userGameDeleted, 1);
    });
    (0, node_test_1.it)('returns zero counts for empty game id list', async () => {
        const stats = await (0, dashboardEviction_1.removeDashboardGameMembership)(makeClient(new Map()), TABLE, USER_ID, []);
        strict_1.default.deepEqual(stats, { recentCompletedDeleted: 0, userGameDeleted: 0 });
    });
});
