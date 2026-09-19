import { describe, expect, it } from 'vitest';
import { cleanupUserDashboardCruft } from './dashboardCruftCleanup.js';

type Store = Map<string, Record<string, unknown>>;

function storeKey(pk: string, sk: string): string {
  return `${pk}:${sk}`;
}

function makeClient(store: Store) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const input = command.input;
      if (command.constructor.name === 'QueryCommand') {
        const pk = (input.ExpressionAttributeValues as Record<string, string>)[':pk'];
        const items = [...store.values()].filter(item => item.pk === pk);
        return { Items: items.map(item => ({ ...item })) };
      }
      if (command.constructor.name === 'DeleteCommand') {
        const key = input.Key as { pk: string; sk: string };
        store.delete(storeKey(key.pk, key.sk));
        return {};
      }
      throw new Error(`Unhandled ${command.constructor.name}`);
    },
  };
}

describe('cleanupUserDashboardCruft', () => {
  it('removes stale recent rows and orphan overlays', async () => {
    const userId = 'user-1';
    const store: Store = new Map([
      [storeKey(`RECENTCOMPLETED#${userId}`, 'stale'), {
        pk: `RECENTCOMPLETED#${userId}`,
        sk: 'stale',
        toMove: '',
      }],
      [storeKey(`USERGAME#${userId}`, 'stale'), {
        pk: `USERGAME#${userId}`,
        sk: 'stale',
        seen: 1,
      }],
      [storeKey(`USERGAME#${userId}`, 'orphan'), {
        pk: `USERGAME#${userId}`,
        sk: 'orphan',
        seen: 2,
      }],
    ]);

    const stats = await cleanupUserDashboardCruft(
      makeClient(store) as never,
      'abstract-play-test',
      userId,
      Date.parse('2026-08-24T12:00:00.000Z'),
    );

    expect(stats.recentCompletedDeleted).toBe(1);
    expect(stats.userGameDeleted).toBe(2);
    expect(store.has(storeKey(`RECENTCOMPLETED#${userId}`, 'stale'))).toBe(false);
    expect(store.has(storeKey(`USERGAME#${userId}`, 'orphan'))).toBe(false);
  });
});
