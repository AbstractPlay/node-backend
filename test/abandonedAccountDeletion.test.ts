import { describe, expect, it, vi } from 'vitest';
import { confirmAbandonedAccountEligible } from '../lib/abandonedAccountDeletion.js';

const TABLE = 'abstract-play-test';
const INACTIVE_BEFORE = 1_000_000;

function mockClient(handlers: {
  get?: (key: { pk: string; sk: string }) => Record<string, unknown> | undefined;
  query?: (pk: string) => Record<string, unknown>[];
}) {
  return {
    send: vi.fn(async (command: { input?: Record<string, unknown> }) => {
      const input = command.input ?? {};
      if (input.KeyConditionExpression) {
        const pk = (input.ExpressionAttributeValues as Record<string, string>)?.[':pk'];
        return { Items: handlers.query?.(pk ?? '') ?? [] };
      }
      if (input.Key) {
        const key = input.Key as { pk: string; sk: string };
        const item = handlers.get?.(key);
        return { Item: item };
      }
      return {};
    }),
  };
}

describe('abandonedAccountDeletion', () => {
  it('confirm rejects completed games partition', async () => {
    const client = mockClient({
      get: key => {
        if (key.pk === 'USER' && key.sk === 'u1') {
          return { lastSeen: 100 };
        }
        if (key.pk === 'USERS' && key.sk === 'u1') {
          return { name: 'Alice' };
        }
        return undefined;
      },
      query: pk => (pk === 'COMPLETEDGAMES#u1' ? [{ sk: '1#g1' }] : []),
    });

    const result = await confirmAbandonedAccountEligible(
      client as never,
      TABLE,
      'u1',
      INACTIVE_BEFORE,
    );
    expect(result).toEqual({ ok: false, reason: 'completed_game' });
  });

  it('confirm rejects arena seat', async () => {
    const client = mockClient({
      get: key => {
        if (key.pk === 'USER' && key.sk === 'u1') {
          return { lastSeen: 100 };
        }
        if (key.pk === 'USERS' && key.sk === 'u1') {
          return { name: 'Alice' };
        }
        if (key.pk === 'ARENAUSER' && key.sk === 'u1') {
          return { pk: 'ARENAUSER' };
        }
        return undefined;
      },
      query: () => [],
    });

    const result = await confirmAbandonedAccountEligible(
      client as never,
      TABLE,
      'u1',
      INACTIVE_BEFORE,
    );
    expect(result).toEqual({ ok: false, reason: 'arena_active' });
  });
});
