import { describe, expect, it } from 'vitest';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { WriteJournal } from './writeJournal.js';

describe('WriteJournal', () => {
  it('rolls back creates in reverse order', async () => {
    const journal = new WriteJournal();
    journal.trackCreate('GAME', 'chess#0#g1');
    journal.trackCreate('TOURNAMENTGAME', 't#1#g1');

    const calls: string[] = [];
    await journal.rollback(
      {} as never,
      'table',
      async (cmd) => {
        if (cmd instanceof DeleteCommand) {
          calls.push(`${cmd.input.Key?.pk}/${cmd.input.Key?.sk}`);
        }
        return {};
      },
    );

    expect(calls).toEqual(['TOURNAMENTGAME/t#1#g1', 'GAME/chess#0#g1']);
  });

  it('restores replaced items on rollback', async () => {
    const journal = new WriteJournal();
    journal.trackReplace({ pk: 'TOURNAMENT', sk: 't1', started: false }, 'TOURNAMENT', 't1');

    const puts: Record<string, unknown>[] = [];
    await journal.rollback(
      {} as never,
      'table',
      async (cmd) => {
        if (cmd instanceof PutCommand) {
          puts.push(cmd.input.Item as Record<string, unknown>);
        }
        return {};
      },
    );

    expect(puts).toHaveLength(1);
    expect(puts[0]?.started).toBe(false);
  });
});

describe('canonicalPlayerPair', () => {
  it('orders player ids consistently', async () => {
    const { canonicalPlayerPair } = await import('./tournamentPairing.js');
    expect(canonicalPlayerPair('b', 'a')).toBe('a#b');
    expect(canonicalPlayerPair('a', 'b')).toBe('a#b');
  });
});
