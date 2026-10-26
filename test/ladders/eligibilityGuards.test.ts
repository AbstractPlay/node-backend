import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ladderPlayerFixture, ladderRecordFixture } from '../fixtures/ladders.js';

const ladderPoolPairBlocked = vi.hoisted(() => vi.fn());
const getLadderPairLastPlayedAt = vi.hoisted(() => vi.fn());
const isBotId = vi.hoisted(() => vi.fn());

vi.mock('../../lib/ladders/blocks.js', () => ({
  ladderPoolPairBlocked,
  isPlayerBlocked: vi.fn(),
}));

vi.mock('../../lib/ladders/pairHistory.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../lib/ladders/pairHistory.js')>();
  return {
    ...orig,
    getLadderPairLastPlayedAt,
  };
});

vi.mock('../../lib/participants.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../lib/participants.js')>();
  return {
    ...orig,
    isBotId,
  };
});

const {
  assertLadderMatchmakingOpen,
  assertActiveLadderMember,
  opponentPassesLadderGuards,
  hasOutgoingLadderChallenge,
} = await import('../../lib/ladders/eligibility.js');

const LADDER_ID = 'l1';
const NOW = Date.UTC(2026, 5, 1);
const TABLE = 'test-table';

function mockClient(userRows: Record<string, Record<string, unknown>>): DynamoDBDocumentClient {
  return {
    send: vi.fn(async (command: unknown) => {
      if (command instanceof GetCommand) {
        const key = command.input.Key as { pk: string; sk: string };
        if (key.pk === 'USER') {
          const row = userRows[key.sk];
          return row ? { Item: row } : {};
        }
      }
      return {};
    }),
  } as unknown as DynamoDBDocumentClient;
}

function baseCtx(overrides: Partial<{
  callerPoints: number;
  opponentPoints: number;
  opponentStatus: 'active' | 'left';
  opponentGames: number;
  requireReach: boolean;
  checkBlocks: boolean;
}> = {}) {
  const ladder = ladderRecordFixture(LADDER_ID);
  const caller = ladderPlayerFixture('caller', LADDER_ID, {
    points: overrides.callerPoints ?? 1000,
  });
  const opponent = ladderPlayerFixture('opponent', LADDER_ID, {
    points: overrides.opponentPoints ?? 1000,
    membershipStatus: overrides.opponentStatus ?? 'active',
    activeLadderGameCount: overrides.opponentGames ?? 0,
  });
  return {
    client: mockClient({}),
    tableName: TABLE,
    ladder,
    caller,
    opponent,
    now: NOW,
    requireReach: overrides.requireReach ?? true,
    checkBlocks: overrides.checkBlocks ?? false,
  };
}

describe('ladder eligibility guards (Phase 2 matrix)', () => {
  beforeEach(() => {
    ladderPoolPairBlocked.mockReset();
    ladderPoolPairBlocked.mockResolvedValue(false);
    getLadderPairLastPlayedAt.mockReset();
    getLadderPairLastPlayedAt.mockResolvedValue(undefined);
    isBotId.mockReset();
    isBotId.mockImplementation(async (id: string) => id.startsWith('bot'));
  });

  it('assertLadderMatchmakingOpen rejects non-active ladder', () => {
    const forming = ladderRecordFixture(LADDER_ID, { status: 'forming' });
    expect(assertLadderMatchmakingOpen(forming)).toBe('ladder_not_active');
    const suspended = ladderRecordFixture(LADDER_ID, { status: 'suspended' });
    expect(assertLadderMatchmakingOpen(suspended)).toBe('ladder_not_active');
    expect(assertLadderMatchmakingOpen(ladderRecordFixture(LADDER_ID, { status: 'active' }))).toBeNull();
  });

  it('assertActiveLadderMember rejects left or missing', () => {
    expect(assertActiveLadderMember(undefined)).toBe('not_active_member');
    expect(assertActiveLadderMember(ladderPlayerFixture('x', LADDER_ID, { membershipStatus: 'left' })))
      .toBe('not_active_member');
  });

  it('opponentPassesLadderGuards: out_of_reach when requireReach', async () => {
    const ctx = baseCtx({ callerPoints: 1000, opponentPoints: 1500, requireReach: true });
    expect(await opponentPassesLadderGuards(ctx)).toBe('out_of_reach');
  });

  it('opponentPassesLadderGuards: skips reach when requireReach false', async () => {
    const ctx = baseCtx({ callerPoints: 1000, opponentPoints: 1500, requireReach: false });
    expect(await opponentPassesLadderGuards(ctx)).toBeNull();
  });

  it('opponentPassesLadderGuards: opponent_at_cap', async () => {
    const ctx = baseCtx({ opponentGames: 7 });
    expect(await opponentPassesLadderGuards(ctx)).toBe('opponent_at_cap');
  });

  it('opponentPassesLadderGuards: opponent_is_bot', async () => {
    const ctx = baseCtx();
    ctx.opponent = ladderPlayerFixture('bot-1', LADDER_ID);
    expect(await opponentPassesLadderGuards(ctx)).toBe('opponent_is_bot');
  });

  it('opponentPassesLadderGuards: rematch_cooldown', async () => {
    getLadderPairLastPlayedAt.mockResolvedValue(NOW - 86_400_000);
    const ctx = baseCtx();
    expect(await opponentPassesLadderGuards(ctx)).toBe('rematch_cooldown');
  });

  it('opponentPassesLadderGuards: blocked only when checkBlocks (pool)', async () => {
    ladderPoolPairBlocked.mockResolvedValue(true);
    const poolCtx = baseCtx({ checkBlocks: true });
    expect(await opponentPassesLadderGuards(poolCtx)).toBe('blocked');
    const directCtx = baseCtx({ checkBlocks: false });
    expect(await opponentPassesLadderGuards(directCtx)).toBeNull();
  });

  it('opponentPassesLadderGuards: opponent_on_vacation', async () => {
    const vacationFields = {
      vacationStartsAt: NOW - 3600_000,
      vacationStintStartedAt: NOW - 3600_000,
      vacationOpenEnded: true,
    };
    const ctx = baseCtx();
    ctx.client = mockClient({ opponent: vacationFields });
    expect(await opponentPassesLadderGuards(ctx)).toBe('opponent_on_vacation');
  });

  it('hasOutgoingLadderChallenge detects issuer pending ladder challenge', async () => {
    const client = {
      send: vi.fn(async (command: unknown) => {
        if (command instanceof GetCommand) {
          const key = command.input.Key as { pk: string; sk: string };
          if (key.pk === 'USER' && key.sk === 'caller') {
            return { Item: { challenges_issued: new Set(['ch-1']) } };
          }
          if (key.pk === 'USER') {
            return { Item: { challenges_issued: new Set() } };
          }
        }
        if (command instanceof BatchGetCommand) {
          return {
            Responses: {
              [TABLE]: [{
                ladderId: LADDER_ID,
                challenger: { id: 'caller' },
              }],
            },
          };
        }
        return {};
      }),
    } as unknown as DynamoDBDocumentClient;

    expect(await hasOutgoingLadderChallenge(client, TABLE, 'caller', LADDER_ID)).toBe(true);
    expect(await hasOutgoingLadderChallenge(client, TABLE, 'other', LADDER_ID)).toBe(false);
  });
});
