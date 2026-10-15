import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runBotVerb } from '../api/routes/bot.js';
import { handleMove } from '../lib/bots/move.js';
import { handlePingOwner } from '../lib/bots/pingOwner.js';
import * as ownerAlerts from '../lib/bots/ownerAlerts.js';

const getBotRecord = vi.fn();
const loadGameRecord = vi.fn();
const getToMovePlayerIds = vi.fn();
const submitMove = vi.fn();
const createNotification = vi.fn();
const ddbSend = vi.fn();

vi.mock('../lib/participants.js', () => ({
  getBotRecord: (...args: unknown[]) => getBotRecord(...args),
}));

vi.mock('../lib/botOutbound.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/botOutbound.js')>();
  return {
    ...actual,
    loadGameRecord: (...args: unknown[]) => loadGameRecord(...args),
    getToMovePlayerIds: (...args: unknown[]) => getToMovePlayerIds(...args),
  };
});

vi.mock('../lib/games/playHandlers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/games/playHandlers.js')>();
  return {
    ...actual,
    submitMove: (...args: unknown[]) => submitMove(...args),
    submitComment: vi.fn().mockResolvedValue({ statusCode: 200, body: '{}', headers: {} }),
  };
});

vi.mock('../lib/notifications.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/notifications.js')>();
  return {
    ...actual,
    createNotification: (...args: unknown[]) => createNotification(...args),
  };
});

vi.mock('../lib/ddb.js', () => ({
  ddbDocClient: { send: (...args: unknown[]) => ddbSend(...args) },
}));

const claims = {
  sub: 'bot-client-id',
  email: 'bot@example.com',
  email_verified: true,
};

const bot = { sk: 'bot-client-id', name: 'Test Bot', owner: 'owner-user', endpoint: 'https://example.com' };
const game = {
  id: 'game-1',
  metaGame: 'abande',
  state: '{}',
  variants: [],
  players: [{ id: 'bot-client-id', name: 'Test Bot' }, { id: 'human' }],
  toMove: '0',
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ABSTRACT_PLAY_TABLE = 'test-table';
  getBotRecord.mockResolvedValue(bot);
  loadGameRecord.mockResolvedValue(game);
  getToMovePlayerIds.mockReturnValue(['bot-client-id']);
  createNotification.mockResolvedValue(undefined);
});

describe('bot move apply failure alerts', () => {
  it('notifies owner when submitMove fails after turn validation', async () => {
    submitMove.mockResolvedValue({
      statusCode: 500,
      body: JSON.stringify({ message: 'VALIDATION_GENERAL' }),
      headers: {},
    });
    const recordSpy = vi.spyOn(ownerAlerts, 'recordBotApplyFailure').mockResolvedValue(undefined);

    const result = await handleMove(claims, {
      gameid: 'game-1',
      metaGame: 'abande',
      move: 'bad',
    });

    expect(result.statusCode).toBe(500);
    expect(recordSpy).toHaveBeenCalledOnce();
    expect(recordSpy.mock.calls[0]![0].verb).toBe('move');
    recordSpy.mockRestore();
  });

  it('does not notify when submitMove succeeds', async () => {
    submitMove.mockResolvedValue({
      statusCode: 200,
      body: '{"id":"game-1"}',
      headers: {},
    });
    const recordSpy = vi.spyOn(ownerAlerts, 'recordBotApplyFailure').mockResolvedValue(undefined);

    await handleMove(claims, {
      gameid: 'game-1',
      metaGame: 'abande',
      move: 'd4',
    });

    expect(recordSpy).not.toHaveBeenCalled();
    recordSpy.mockRestore();
  });
});

describe('pingOwner verb', () => {
  it('routes pingOwner to handlePingOwner', async () => {
    ddbSend
      .mockResolvedValueOnce({}) // rate limit claim
      .mockResolvedValueOnce({ Item: { settings: {} } }); // owner USER

    const result = await runBotVerb('pingOwner', claims, {
      message: 'Java process crashed',
      gameid: 'game-1',
      metaGame: 'abande',
    });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toEqual({ notified: true });
    expect(createNotification).toHaveBeenCalled();
  });

  it('returns rate_limited without creating notification when cooldown active', async () => {
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    ddbSend.mockRejectedValueOnce(err);

    const result = await handlePingOwner(claims, { message: 'again' });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toEqual({ notified: false, reason: 'rate_limited' });
    expect(createNotification).not.toHaveBeenCalled();
  });
});
