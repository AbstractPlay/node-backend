import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const send = vi.fn();
const arenaTimedOutPlayerIndex = vi.fn();
const timeloss = vi.fn();
const rescheduleArenaFlagForGame = vi.fn();
const deleteArenaFlagForGame = vi.fn();

vi.mock('../../lib/ddb.js', () => ({
  ddbDocClient: { send: (...args: unknown[]) => send(...args) },
}));

vi.mock('../../lib/gameState.js', () => ({
  hydrateGameState: (item: unknown) => item,
}));

vi.mock('../../lib/arena/arenaOutOfTime.js', () => ({
  arenaTimedOutPlayerIndex: (...args: unknown[]) => arenaTimedOutPlayerIndex(...args),
}));

vi.mock('../../lib/games/timeloss.js', () => ({
  timeloss: (...args: unknown[]) => timeloss(...args),
}));

vi.mock('../../lib/arena/rescheduleArenaFlag.js', () => ({
  rescheduleArenaFlagForGame: (...args: unknown[]) => rescheduleArenaFlagForGame(...args),
  deleteArenaFlagForGame: (...args: unknown[]) => deleteArenaFlagForGame(...args),
}));

const payload = {
  metaGame: 'abande',
  gameId: '557f013e-60b5-42ed-9443-e77692df2cc4',
  clockGeneration: 2,
};

const liveGame = {
  pk: 'GAME',
  sk: 'abande#0#557f013e-60b5-42ed-9443-e77692df2cc4',
  id: '557f013e-60b5-42ed-9443-e77692df2cc4',
  metaGame: 'abande',
  playMode: 'arena',
  clockGeneration: 2,
  toMove: '0',
  lastMoveTime: 1_000_000,
  state: '{}',
  players: [{ id: 'p0', time: 5000 }, { id: 'p1', time: 5000 }],
};

describe('arenaFlagWorker', () => {
  beforeEach(() => {
    send.mockReset();
    arenaTimedOutPlayerIndex.mockReset();
    timeloss.mockReset();
    rescheduleArenaFlagForGame.mockReset();
    deleteArenaFlagForGame.mockReset();
    process.env.ABSTRACT_PLAY_TABLE = 'abstract-play-test';
    rescheduleArenaFlagForGame.mockResolvedValue(undefined);
    timeloss.mockResolvedValue({});
    deleteArenaFlagForGame.mockResolvedValue(undefined);
  });

  it('re-arms scheduler when fired before grace', async () => {
    send.mockResolvedValueOnce({ Item: liveGame });
    arenaTimedOutPlayerIndex.mockReturnValue(null);

    const { handler } = await import('../../api/arenaFlagWorker.js');
    await handler(JSON.stringify(payload));

    expect(rescheduleArenaFlagForGame).toHaveBeenCalledWith(
      {
        id: liveGame.id,
        metaGame: liveGame.metaGame,
        clockGeneration: liveGame.clockGeneration,
        players: liveGame.players,
        toMove: liveGame.toMove,
        lastMoveTime: liveGame.lastMoveTime,
      },
      expect.any(Number),
    );
    expect(timeloss).not.toHaveBeenCalled();
  });

  it('runs timeloss when player is past grace', async () => {
    send.mockResolvedValueOnce({ Item: liveGame });
    arenaTimedOutPlayerIndex.mockReturnValue(0);

    const { handler } = await import('../../api/arenaFlagWorker.js');
    await handler(JSON.stringify(payload));

    expect(timeloss).toHaveBeenCalledWith(
      false,
      0,
      payload.gameId,
      payload.metaGame,
      expect.any(Number),
    );
    expect(deleteArenaFlagForGame).toHaveBeenCalledWith(payload.gameId);
    expect(rescheduleArenaFlagForGame).not.toHaveBeenCalled();
  });
});
