"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const dashboardMaintenance_1 = require("../lib/dashboardMaintenance");
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
                const item = store.get(key(itemKey.pk, itemKey.sk)) ?? { pk: itemKey.pk, sk: itemKey.sk };
                const values = input.ExpressionAttributeValues;
                const condition = input.ConditionExpression;
                if (condition?.includes('dashboardMaintAt')) {
                    const leaseExpiry = values[':leaseExpiry'];
                    const existing = item.dashboardMaintAt;
                    if (existing !== undefined && existing >= leaseExpiry) {
                        const err = new Error('conditional failed');
                        err.name = 'ConditionalCheckFailedException';
                        throw err;
                    }
                    item.dashboardMaintAt = values[':now'];
                    store.set(key(itemKey.pk, itemKey.sk), item);
                    return {};
                }
                if (condition?.includes('toMove')) {
                    return {};
                }
                throw new Error(`Unhandled UpdateCommand condition: ${condition}`);
            }
            throw new Error(`Unhandled ${command.constructor.name}`);
        },
    };
}
function activeGame() {
    return {
        id: 'active',
        metaGame: 'saltire',
        players: [{ id: 'p0', name: 'Alice' }],
        clockHard: false,
        toMove: '0',
        lastMoveTime: 1,
    };
}
(0, node_test_1.describe)('acquireDashboardMaintenanceLock', () => {
    (0, node_test_1.it)('acquires when dashboardMaintAt is absent', async () => {
        const store = new Map([
            [key('USER', USER_ID), { pk: 'USER', sk: USER_ID }],
        ]);
        const result = await (0, dashboardMaintenance_1.acquireDashboardMaintenanceLock)(makeClient(store), TABLE, USER_ID, NOW);
        strict_1.default.equal(result.acquired, true);
        strict_1.default.equal(store.get(key('USER', USER_ID)).dashboardMaintAt, NOW);
    });
    (0, node_test_1.it)('fails when lease is still held', async () => {
        const store = new Map([
            [key('USER', USER_ID), {
                    pk: 'USER',
                    sk: USER_ID,
                    dashboardMaintAt: NOW - 1000,
                }],
        ]);
        const result = await (0, dashboardMaintenance_1.acquireDashboardMaintenanceLock)(makeClient(store), TABLE, USER_ID, NOW);
        strict_1.default.equal(result.acquired, false);
    });
    (0, node_test_1.it)('acquires when lease has expired', async () => {
        const store = new Map([
            [key('USER', USER_ID), {
                    pk: 'USER',
                    sk: USER_ID,
                    dashboardMaintAt: NOW - dashboardMaintenance_1.DASHBOARD_MAINTENANCE_LEASE_MS - 1,
                }],
        ]);
        const result = await (0, dashboardMaintenance_1.acquireDashboardMaintenanceLock)(makeClient(store), TABLE, USER_ID, NOW);
        strict_1.default.equal(result.acquired, true);
    });
});
(0, node_test_1.describe)('runDashboardMaintenance', () => {
    (0, node_test_1.it)('runs timeout sweep without evicting completed games', async () => {
        const store = new Map([
            [key('USER', USER_ID), { pk: 'USER', sk: USER_ID }],
        ]);
        const games = [activeGame()];
        const result = await (0, dashboardMaintenance_1.runDashboardMaintenance)(makeClient(store), TABLE, USER_ID, games, {
            client: makeClient(store),
            tableName: TABLE,
            timeloss: async () => { },
            now: () => NOW,
        });
        strict_1.default.equal(result.maintenanceRan, true);
        strict_1.default.deepEqual(result.evictedIds, []);
        strict_1.default.equal(result.games.length, 1);
        strict_1.default.equal(result.games[0].id, 'active');
    });
    (0, node_test_1.it)('skips maintenance when lock is not acquired', async () => {
        const store = new Map([
            [key('USER', USER_ID), {
                    pk: 'USER',
                    sk: USER_ID,
                    dashboardMaintAt: NOW,
                }],
        ]);
        const games = [activeGame()];
        const result = await (0, dashboardMaintenance_1.runDashboardMaintenance)(makeClient(store), TABLE, USER_ID, games, {
            client: makeClient(store),
            tableName: TABLE,
            timeloss: async () => { },
            now: () => NOW,
        });
        strict_1.default.equal(result.maintenanceRan, false);
        strict_1.default.equal(result.games, games);
        strict_1.default.deepEqual(result.evictedIds, []);
    });
});
