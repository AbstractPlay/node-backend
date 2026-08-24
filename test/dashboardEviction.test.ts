import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeDashboardGameMembership } from '../lib/dashboardEviction';

const TABLE = 'test-table';
const USER_ID = 'user-1';

type Store = Map<string, Record<string, unknown>>;

function key(pk: string, sk: string): string {
  return `${pk}:${sk}`;
}

function makeClient(store: Store) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const input = command.input;
      if (command.constructor.name === 'DeleteCommand') {
        const itemKey = input.Key as { pk: string; sk: string };
        store.delete(key(itemKey.pk, itemKey.sk));
        return {};
      }
      throw new Error(`Unhandled ${command.constructor.name}`);
    },
  };
}

describe('removeDashboardGameMembership', () => {
  it('deletes RECENTCOMPLETED# and USERGAME# for each game id', async () => {
    const store: Store = new Map([
      [key(`RECENTCOMPLETED#${USER_ID}`, 'g1'), { pk: `RECENTCOMPLETED#${USER_ID}`, sk: 'g1' }],
      [key(`USERGAME#${USER_ID}`, 'g1'), { pk: `USERGAME#${USER_ID}`, sk: 'g1' }],
      [key(`RECENTCOMPLETED#${USER_ID}`, 'g2'), { pk: `RECENTCOMPLETED#${USER_ID}`, sk: 'g2' }],
      [key(`USERGAME#${USER_ID}`, 'g2'), { pk: `USERGAME#${USER_ID}`, sk: 'g2' }],
    ]);

    const stats = await removeDashboardGameMembership(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      ['g1', 'g2'],
    );

    assert.equal(stats.recentCompletedDeleted, 2);
    assert.equal(stats.userGameDeleted, 2);
    assert.equal(store.size, 0);
  });

  it('is idempotent when rows are already absent', async () => {
    const store: Store = new Map();

    const stats = await removeDashboardGameMembership(
      makeClient(store) as never,
      TABLE,
      USER_ID,
      ['missing'],
    );

    assert.equal(stats.recentCompletedDeleted, 1);
    assert.equal(stats.userGameDeleted, 1);
  });

  it('returns zero counts for empty game id list', async () => {
    const stats = await removeDashboardGameMembership(
      makeClient(new Map()) as never,
      TABLE,
      USER_ID,
      [],
    );

    assert.deepEqual(stats, { recentCompletedDeleted: 0, userGameDeleted: 0 });
  });
});
