import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  checkAndProcessGameTimeout,
  sweepUserGameTimeouts,
  type TimelossFn,
} from '../lib/gameTimeout.js';
import type { DashboardGame } from '../lib/dashboardGames.js';

const TABLE = 'test-table';
const NOW = Date.parse('2026-08-24T12:00:00.000Z');

function activeGame(overrides: Partial<DashboardGame> = {}): DashboardGame {
  return {
    id: 'g1',
    metaGame: 'saltire',
    players: [
      { id: 'p0', name: 'Alice', time: 60000 },
      { id: 'p1', name: 'Bob', time: 60000 },
    ],
    clockHard: true,
    toMove: '0',
    lastMoveTime: NOW - 120000,
    ...overrides,
  };
}

function makeClient(onUpdate?: (input: Record<string, unknown>) => void | Promise<void>) {
  return {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      if (command.constructor.name === 'UpdateCommand') {
        await onUpdate?.(command.input);
        return {};
      }
      throw new Error(`Unhandled ${command.constructor.name}`);
    },
  };
}

describe('checkAndProcessGameTimeout', () => {
  it('processes a timed-out turn-based game', async () => {
    const game = activeGame();
    let timelossCalls = 0;
    const timeloss: TimelossFn = async () => {
      timelossCalls += 1;
    };

    const result = await checkAndProcessGameTimeout(game, {
      client: makeClient() as never,
      tableName: TABLE,
      timeloss,
      now: () => NOW,
    });

    assert.equal(result.processed, true);
    assert.equal(result.game.toMove, '');
    assert.equal(timelossCalls, 1);
  });

  it('skips when clock has not expired', async () => {
    const game = activeGame({ lastMoveTime: NOW - 1000 });
    let timelossCalls = 0;

    const result = await checkAndProcessGameTimeout(game, {
      client: makeClient() as never,
      tableName: TABLE,
      timeloss: async () => { timelossCalls += 1; },
      now: () => NOW,
    });

    assert.equal(result.processed, false);
    assert.equal(timelossCalls, 0);
  });

  it('does not call timeloss on conditional check failure', async () => {
    const game = activeGame();
    let timelossCalls = 0;
    const client = makeClient(async () => {
      const err = new Error('conditional failed');
      (err as Error & { name: string }).name = 'ConditionalCheckFailedException';
      throw err;
    });

    const result = await checkAndProcessGameTimeout(game, {
      client: client as never,
      tableName: TABLE,
      timeloss: async () => { timelossCalls += 1; },
      now: () => NOW,
    });

    assert.equal(result.processed, false);
    assert.equal(result.game.toMove, '');
    assert.equal(timelossCalls, 0);
  });

  it('processes simultaneous clock timeout for the most overdue player', async () => {
    const game = activeGame({
      toMove: [true, true],
      players: [
        { id: 'p0', name: 'Alice', time: 30000 },
        { id: 'p1', name: 'Bob', time: 10000 },
      ],
      lastMoveTime: NOW - 50000,
    });
    let timedOutPlayer = -1;
    const timeloss: TimelossFn = async (_check, player) => {
      timedOutPlayer = player;
    };

    const result = await checkAndProcessGameTimeout(game, {
      client: makeClient() as never,
      tableName: TABLE,
      timeloss,
      now: () => NOW,
    });

    assert.equal(result.processed, true);
    assert.equal(timedOutPlayer, 1);
  });
});

describe('sweepUserGameTimeouts', () => {
  it('returns updated games after sweep', async () => {
    const games = [
      activeGame({ id: 'g1' }),
      activeGame({ id: 'g2', clockHard: false }),
    ];
    let timelossCalls = 0;

    const swept = await sweepUserGameTimeouts(games, {
      client: makeClient() as never,
      tableName: TABLE,
      timeloss: async () => { timelossCalls += 1; },
      now: () => NOW,
    });

    assert.equal(swept.length, 2);
    assert.equal(swept[0]!.toMove, '');
    assert.equal(swept[1]!.toMove, '0');
    assert.equal(timelossCalls, 1);
  });
});
