import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireDashboardMaintenanceLock,
  runDashboardMaintenance,
  DASHBOARD_MAINTENANCE_LEASE_MS,
} from '../lib/dashboardMaintenance';
import type { DashboardGame } from '../lib/dashboardGames';

const TABLE = 'test-table';
const USER_ID = 'user-1';
const NOW = Date.parse('2026-08-24T12:00:00.000Z');

type Store = Map<string, Record<string, unknown>>;

function key(pk: string, sk: string): string {
  return `${pk}:${sk}`;
}

function makeClient(store: Store) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const input = command.input;
      if (command.constructor.name === 'UpdateCommand') {
        const itemKey = input.Key as { pk: string; sk: string };
        const item = store.get(key(itemKey.pk, itemKey.sk)) ?? { pk: itemKey.pk, sk: itemKey.sk };
        const values = input.ExpressionAttributeValues as Record<string, unknown>;
        const condition = input.ConditionExpression as string | undefined;
        if (condition?.includes('dashboardMaintAt')) {
          const leaseExpiry = values[':leaseExpiry'] as number;
          const existing = item.dashboardMaintAt as number | undefined;
          if (existing !== undefined && existing >= leaseExpiry) {
            const err = new Error('conditional failed');
            (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
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

function activeGame(): DashboardGame {
  return {
    id: 'active',
    metaGame: 'saltire',
    players: [{ id: 'p0', name: 'Alice' }],
    clockHard: false,
    toMove: '0',
    lastMoveTime: 1,
  };
}

describe('acquireDashboardMaintenanceLock', () => {
  it('acquires when dashboardMaintAt is absent', async () => {
    const store: Store = new Map([
      [key('USER', USER_ID), { pk: 'USER', sk: USER_ID }],
    ]);
    const result = await acquireDashboardMaintenanceLock(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      NOW,
    );
    assert.equal(result.acquired, true);
    assert.equal((store.get(key('USER', USER_ID)) as { dashboardMaintAt: number }).dashboardMaintAt, NOW);
  });

  it('fails when lease is still held', async () => {
    const store: Store = new Map([
      [key('USER', USER_ID), {
        pk: 'USER',
        sk: USER_ID,
        dashboardMaintAt: NOW - 1000,
      }],
    ]);
    const result = await acquireDashboardMaintenanceLock(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      NOW,
    );
    assert.equal(result.acquired, false);
  });

  it('acquires when lease has expired', async () => {
    const store: Store = new Map([
      [key('USER', USER_ID), {
        pk: 'USER',
        sk: USER_ID,
        dashboardMaintAt: NOW - DASHBOARD_MAINTENANCE_LEASE_MS - 1,
      }],
    ]);
    const result = await acquireDashboardMaintenanceLock(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      NOW,
    );
    assert.equal(result.acquired, true);
  });
});

describe('runDashboardMaintenance', () => {
  it('runs timeout sweep without evicting completed games', async () => {
    const store: Store = new Map([
      [key('USER', USER_ID), { pk: 'USER', sk: USER_ID }],
    ]);
    const games = [activeGame()];

    const result = await runDashboardMaintenance(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      games,
      {
        client: makeClient(store) as never,
        tableName: TABLE,
        timeloss: async () => {},
        now: () => NOW,
      },
    );

    assert.equal(result.maintenanceRan, true);
    assert.deepEqual(result.evictedIds, []);
    assert.equal(result.games.length, 1);
    assert.equal(result.games[0]!.id, 'active');
  });

  it('skips maintenance when lock is not acquired', async () => {
    const store: Store = new Map([
      [key('USER', USER_ID), {
        pk: 'USER',
        sk: USER_ID,
        dashboardMaintAt: NOW,
      }],
    ]);
    const games = [activeGame()];

    const result = await runDashboardMaintenance(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      games,
      {
        client: makeClient(store) as never,
        tableName: TABLE,
        timeloss: async () => {},
        now: () => NOW,
      },
    );

    assert.equal(result.maintenanceRan, false);
    assert.equal(result.games, games);
    assert.deepEqual(result.evictedIds, []);
  });
});
