import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runBotVerb } from '../api/routes/bot.js';
import { handlePie } from '../lib/bots/pie.js';

const getBotRecord = vi.fn();
const loadGameRecord = vi.fn();
const getToMovePlayerIds = vi.fn();
const invokePie = vi.fn();

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
    invokePie: (...args: unknown[]) => invokePie(...args),
  };
});

const claims = {
  sub: 'bot-client-id',
  email: 'bot@example.com',
  email_verified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getBotRecord.mockResolvedValue({ id: 'bot-client-id' });
  loadGameRecord.mockResolvedValue({
    metaGame: 'dagnacht',
    players: [{ id: 'bot-client-id' }, { id: 'human' }],
    toMove: '0',
  });
  getToMovePlayerIds.mockReturnValue(['bot-client-id']);
  invokePie.mockResolvedValue({
    statusCode: 200,
    body: '{"pieInvoked":true}',
    headers: { 'Content-Type': 'application/json' },
  });
});

describe('botQuery pie verb', () => {
  it('routes pie to handlePie and invokePie when it is the bot turn', async () => {
    const result = await runBotVerb('pie', claims, {
      gameid: 'game-1',
      metaGame: 'dagnacht',
    });
    expect(result.statusCode).toBe(200);
    expect(invokePie).toHaveBeenCalledWith('bot-client-id', {
      id: 'game-1',
      metaGame: 'dagnacht',
      cbit: 0,
    });
  });

  it('rejects pie when it is not the bot turn', async () => {
    getToMovePlayerIds.mockReturnValue(['human']);
    const result = await handlePie(claims, { gameid: 'g', metaGame: 'dagnacht' });
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(invokePie).not.toHaveBeenCalled();
  });

  it('returns 400 for unknown verbs', async () => {
    const result = await runBotVerb('dance', claims, {});
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body ?? '{}').message).toMatch(/Unknown bot verb/);
  });
});
