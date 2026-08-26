import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUserDashboardCruft } from '../lib/dashboardCruftCleanup';

const TABLE = 'test-table';
const USER_ID = 'user-1';
const GAME_STALE = 'stale-game';
const GAME_ACTIVE = 'active-game';
const GAME_ORPHAN = 'orphan-overlay';

type Store = Map<string, Record<string, unknown>>;

function key(pk: string, sk: string): string {
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
        const itemKey = input.Key as { pk: string; sk: string };
        store.delete(key(itemKey.pk, itemKey.sk));
        return {};
      }
      throw new Error(`Unhandled ${command.constructor.name}`);
    },
  };
}

describe('cleanupUserDashboardCruft', () => {
  it('deletes all RECENTCOMPLETED# rows and orphan USERGAME# overlays', async () => {
    const store: Store = new Map([
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

    const stats = await cleanupUserDashboardCruft(
      makeClient(store) as never,
      TABLE,
      USER_ID,
    );

    assert.equal(stats.recentCompletedDeleted, 1);
    assert.equal(stats.userGameDeleted, 2);
    assert.equal(store.has(key(`RECENTCOMPLETED#${USER_ID}`, GAME_STALE)), false);
    assert.equal(store.has(key(`USERGAME#${USER_ID}`, GAME_STALE)), false);
    assert.equal(store.has(key(`USERGAME#${USER_ID}`, GAME_ORPHAN)), false);
    assert.equal(store.has(key(`CURRENTGAMES#${USER_ID}`, GAME_ACTIVE)), true);
  });
});
