import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { computeLadderPointDeltas, DEFAULT_LADDER_DELTA_TUNING } from '../lib/ladders/delta.js';
import { ladderGameSk, ladderPlayerSk } from '../lib/ladders/keys.js';
import { ladderPlayerFixture, ladderRecordFixture } from './fixtures/ladders.js';

const TABLE = 'abstract-play-ladder-test';

const { send } = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('../lib/ddb.js', () => ({
  ddbDocClient: { send },
}));

const { applyLadderGameEnd } = await import('../lib/ladders/applyLadderGameEnd.js');

const LADDER_ID = 'ladder-1';
const GAME_ID = 'game-1';
const U1 = 'user-a';
const U2 = 'user-b';
const ENDED = 1_700_000_000_000;

type TxUpdate = {
  Key?: { pk?: string; sk?: string };
  UpdateExpression?: string;
  ExpressionAttributeValues?: Record<string, number>;
};

function playerUpdateValues(
  transact: TransactWriteCommand,
  playerSk: string,
): Record<string, number> | undefined {
  for (const item of transact.input.TransactItems ?? []) {
    if (!('Update' in item)) {
      continue;
    }
    const u = item.Update as TxUpdate;
    if (u.Key?.sk === playerSk) {
      return u.ExpressionAttributeValues;
    }
  }
  return undefined;
}

type PlayerState = {
  points: number;
  activeLadderGameCount: number;
};

function installDdbRouter(players: Record<string, PlayerState>, ladderStatus: 'active' | 'suspended' = 'active') {
  const ladder = ladderRecordFixture(LADDER_ID, { status: ladderStatus });
  let transactCalls = 0;

  send.mockImplementation(async (command: unknown) => {
    if (command instanceof GetCommand) {
      const key = command.input.Key as { pk: string; sk: string };
      if (key.pk === 'LADDERGAME') {
        return { Item: { ladderId: LADDER_ID, gameId: GAME_ID, settled: false } };
      }
      if (key.pk === 'LADDER') {
        return { Item: ladder };
      }
      if (key.pk === 'LADDERPLAYER') {
        const userid = key.sk.split('#')[1]!;
        const row = players[userid];
        if (row === undefined) {
          return {};
        }
        return {
          Item: ladderPlayerFixture(userid, LADDER_ID, {
            points: row.points,
            activeLadderGameCount: row.activeLadderGameCount,
          }),
        };
      }
      return {};
    }
    if (command instanceof TransactWriteCommand) {
      transactCalls += 1;
      return {};
    }
    if (command instanceof PutCommand) {
      const item = command.input.Item as { pk?: string };
      if (item.pk === 'LADDERPAIR') {
        return {};
      }
      return {};
    }
    throw new Error(`unexpected command ${command}`);
  });

  return { getTransactCalls: () => transactCalls };
}

describe('applyLadderGameEnd integration (mocked DDB)', () => {
  beforeEach(() => {
    send.mockReset();
    process.env.ABSTRACT_PLAY_TABLE = TABLE;
  });

  it('applies point deltas on single winner (timeloss uses same path as decisive win)', async () => {
    const players = {
      [U1]: { points: 1000, activeLadderGameCount: 2 },
      [U2]: { points: 1050, activeLadderGameCount: 1 },
    };
    const { getTransactCalls } = installDdbRouter(players);
    const tuning = { ...DEFAULT_LADDER_DELTA_TUNING, ...ladderRecordFixture(LADDER_ID).tuning };
    const pace = 1;
    const expected = computeLadderPointDeltas(1000, 1050, pace, tuning);

    await applyLadderGameEnd({
      id: GAME_ID,
      ladderId: LADDER_ID,
      metaGame: 'amazons',
      winner: [1],
      players: [{ id: U1 }, { id: U2 }],
      rated: true,
      gameEnded: ENDED,
    });

    expect(getTransactCalls()).toBe(1);
    const transact = send.mock.calls.find(c => c[0] instanceof TransactWriteCommand)?.[0] as TransactWriteCommand;
    const winnerVals = playerUpdateValues(transact, ladderPlayerSk(LADDER_ID, U1));
    const loserVals = playerUpdateValues(transact, ladderPlayerSk(LADDER_ID, U2));
    expect(winnerVals?.[':p']).toBe(1000 + expected.winnerGain);
    expect(loserVals?.[':p']).toBe(1050 - expected.loserLoss);

    send.mockReset();
    installDdbRouter({
      [U2]: { points: 1050, activeLadderGameCount: 1 },
      [U1]: { points: 1000, activeLadderGameCount: 2 },
    });
    await applyLadderGameEnd({
      id: 'game-2',
      ladderId: LADDER_ID,
      metaGame: 'amazons',
      winner: [2],
      players: [{ id: U1 }, { id: U2 }],
      rated: true,
      gameEnded: ENDED,
    });
    const transact2 = send.mock.calls.find(c => c[0] instanceof TransactWriteCommand)?.[0] as TransactWriteCommand;
    const winner2Vals = playerUpdateValues(transact2, ladderPlayerSk(LADDER_ID, U2));
    const expected2 = computeLadderPointDeltas(1050, 1000, 1, tuning);
    expect(winner2Vals?.[':p']).toBe(1050 + expected2.winnerGain);
  });

  it('draw applies zero point change but decrements active counts', async () => {
    const players = {
      [U1]: { points: 1000, activeLadderGameCount: 1 },
      [U2]: { points: 1000, activeLadderGameCount: 1 },
    };
    installDdbRouter(players);

    await applyLadderGameEnd({
      id: GAME_ID,
      ladderId: LADDER_ID,
      metaGame: 'amazons',
      winner: [1, 2],
      players: [{ id: U1 }, { id: U2 }],
      rated: true,
      gameEnded: ENDED,
    });

    const transact = send.mock.calls.find(c => c[0] instanceof TransactWriteCommand)?.[0] as TransactWriteCommand;
    const playerUpdates: TxUpdate[] = [];
    for (const item of transact.input.TransactItems ?? []) {
      if (!('Update' in item)) {
        continue;
      }
      const u = item.Update as TxUpdate;
      if (u.Key?.pk === 'LADDERPLAYER') {
        playerUpdates.push(u);
      }
    }
    expect(playerUpdates.length).toBe(2);
    for (const u of playerUpdates) {
      expect(u.UpdateExpression).not.toMatch(/points/);
      expect(u.ExpressionAttributeValues?.[':neg']).toBe(-1);
    }
  });

  it('settles when parent ladder is suspended', async () => {
    installDdbRouter(
      { [U1]: { points: 1000, activeLadderGameCount: 1 }, [U2]: { points: 1000, activeLadderGameCount: 1 } },
      'suspended',
    );
    await applyLadderGameEnd({
      id: GAME_ID,
      ladderId: LADDER_ID,
      metaGame: 'amazons',
      winner: [1, 2],
      players: [{ id: U1 }, { id: U2 }],
      rated: true,
    });
    expect(send.mock.calls.some(c => c[0] instanceof TransactWriteCommand)).toBe(true);
  });

  it('idempotent when LADDERGAME already settled', async () => {
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        if (key.pk === 'LADDERGAME' && key.sk === ladderGameSk(LADDER_ID, GAME_ID)) {
          return { Item: { ladderId: LADDER_ID, gameId: GAME_ID, settled: true } };
        }
      }
      return {};
    });
    await applyLadderGameEnd({
      id: GAME_ID,
      ladderId: LADDER_ID,
      metaGame: 'amazons',
      winner: [1],
      players: [{ id: U1 }, { id: U2 }],
      rated: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
