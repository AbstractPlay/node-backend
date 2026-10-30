import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { wsBroadcast, deleteArenaFlagForGame, broadcastArenaTableActivity } = vi.hoisted(() => ({
  wsBroadcast: vi.fn().mockResolvedValue(undefined),
  deleteArenaFlagForGame: vi.fn().mockResolvedValue(undefined),
  broadcastArenaTableActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/wsBroadcast.js', () => ({ wsBroadcast }));
vi.mock('../../lib/arena/rescheduleArenaFlag.js', () => ({ deleteArenaFlagForGame }));
vi.mock('../../lib/arena/arenaTableActivityWs.js', () => ({
  broadcastArenaTableActivity,
}));

vi.mock('../../lib/gameState.js', () => ({
  hydrateGameState: (item: unknown) => item,
  prepareGameStateForStorage: (game: { state: string }) => game,
}));

import {
  applyArenaPlayStandDownToGame,
  isArenaLaunchSyncWindow,
  rollbackArenaLaunchToLobby,
  standDownArenaPlayReady,
} from '../../lib/arena/arenaLaunchSync.js';

const wsBroadcastMock = wsBroadcast;
const deleteArenaFlagForGameMock = deleteArenaFlagForGame;

function baseGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'table-1',
    metaGame: 'hex',
    playMode: 'arena',
    state: '{}',
    players: [{ id: 'u1' }, { id: 'u2' }],
    toMove: '0',
    numMoves: 0,
    arenaPlayReady: ['u1', 'u2'],
    ...overrides,
  };
}

describe('isArenaLaunchSyncWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is true before countdown and with zero moves', () => {
    const now = 1000;
    expect(isArenaLaunchSyncWindow(baseGame(), now)).toBe(true);
    expect(
      isArenaLaunchSyncWindow(
        baseGame({ arenaClockStartAt: now + 3000 }),
        now,
      ),
    ).toBe(true);
  });

  it('is false after competitive clock is live or after moves', () => {
    const startAt = 5000;
    expect(
      isArenaLaunchSyncWindow(
        baseGame({ arenaClockStartAt: startAt }),
        startAt,
      ),
    ).toBe(false);
    expect(isArenaLaunchSyncWindow(baseGame({ numMoves: 1 }), 1000)).toBe(false);
  });
});

describe('applyArenaPlayStandDownToGame', () => {
  it('removes caller from arenaPlayReady', () => {
    const game = baseGame({ arenaPlayReady: ['u1', 'u2'] });
    const result = applyArenaPlayStandDownToGame(game as never, 'u1');
    expect(result).toEqual({ ok: true, changed: true });
    expect(game.arenaPlayReady).toEqual(['u2']);
  });

  it('clears countdown when armed but Fischer not live', () => {
    const now = 10_000;
    const game = baseGame({
      arenaClockStartAt: now + 2000,
      lastMoveTime: now + 2000,
      arenaPlayReady: ['u1', 'u2'],
    }) as Record<string, unknown>;
    const result = applyArenaPlayStandDownToGame(game as never, 'u2', now);
    expect(result).toEqual({ ok: true, changed: true });
    expect(game.arenaClockStartAt).toBeUndefined();
    expect(game.arenaPlayReady).toEqual([]);
    expect(game.lastMoveTime).toBe(0);
  });
});

describe('standDownArenaPlayReady', () => {
  beforeEach(() => {
    process.env.ABSTRACT_PLAY_TABLE = 'abstract-play-test';
    vi.clearAllMocks();
  });

  it('persists and broadcasts when changed', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Item: baseGame({ arenaPlayReady: ['u1', 'u2'] }) })
      .mockResolvedValueOnce({});
    const client = { send } as never;

    const result = await standDownArenaPlayReady(client, 'u1', 'hex', 'table-1');
    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(wsBroadcastMock).toHaveBeenCalledWith('game', { meta: 'hex', id: 'table-1' });
  });
});

describe('rollbackArenaLaunchToLobby', () => {
  beforeEach(() => {
    process.env.ABSTRACT_PLAY_TABLE = 'abstract-play-test';
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects when competitive clock is live', async () => {
    const startAt = 5000;
    vi.setSystemTime(startAt);
    const send = vi.fn()
      .mockResolvedValueOnce({
        Item: {
          tableId: 'table-1',
          metaGame: 'hex',
          state: 'playing',
          hostId: 'u1',
          seats: [
            { seatIndex: 0, userId: 'u1', ready: true },
            { seatIndex: 1, userId: 'u2', ready: true },
          ],
          variants: [],
          arenaTcId: 'blitz',
          arenaClock: {},
          open: true,
          createdAt: 1,
          updatedAt: 1,
          indexState: 'playing',
        },
      })
      .mockResolvedValueOnce({
        Item: baseGame({ arenaClockStartAt: startAt }),
      });
    const client = { send } as never;

    const result = await rollbackArenaLaunchToLobby(client, 'u1', 'table-1');
    expect(result).toEqual({ error: 'This game can no longer be returned to the lobby.' });
  });

  it('deletes game and resets table in sync window', async () => {
    vi.setSystemTime(1000);
    const send = vi.fn()
      .mockResolvedValueOnce({
        Item: {
          tableId: 'table-1',
          metaGame: 'hex',
          state: 'playing',
          hostId: 'u1',
          seats: [
            { seatIndex: 0, userId: 'u1', ready: true },
            { seatIndex: 1, userId: 'u2', ready: true },
          ],
          variants: [],
          arenaTcId: 'blitz',
          arenaClock: {},
          open: true,
          createdAt: 1,
          updatedAt: 1,
          indexState: 'playing',
          gameStartedAt: 100,
        },
      })
      .mockResolvedValueOnce({ Item: baseGame() })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = { send } as never;

    const result = await rollbackArenaLaunchToLobby(client, 'u1', 'table-1');
    expect(result).toEqual({ ok: true, metaGame: 'hex' });
    expect(deleteArenaFlagForGameMock).toHaveBeenCalledWith('table-1');
    const deleteCall = send.mock.calls.find(
      (c) =>
        c[0]?.input?.Key?.pk === 'GAME'
        && c[0]?.input?.Key?.sk === 'hex#0#table-1',
    );
    expect(deleteCall).toBeTruthy();
    expect(wsBroadcastMock).toHaveBeenCalledWith('game', { meta: 'hex', id: 'table-1' });
  });
});
