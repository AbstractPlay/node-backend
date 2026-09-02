import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { gameRecordSk } from '../lib/commentAuth.js';
import {
  buildGameSummary,
  countGameWatchers,
  countUserRecommendationsForMetaGame,
  highlightGame,
  isQualityCompletedGame,
  recommendGame,
  updateLastChatForWatchers,
  watchGame,
  type GameMarkSource,
} from '../lib/playerGameMarks.js';

const TABLE = 'abstract-play-test';
const META = 'emu';
const GAME_ID = 'd70ccde2-3c93-4ad5-b71f-f5c8f6015500';
const PLAYER_A = '31af49bc-2030-4adb-aec9-dc8fa418fec1';
const PLAYER_B = '5448f4f8-90d1-70c3-1cb9-3ad42904e413';
const SPECTATOR = 'a82c4aa8-7d43-4661-b027-17afd1d1586f';

type Item = Record<string, unknown>;

function itemKey(item: Item): string {
  return `${item.pk}:${item.sk}`;
}

function activeGame(players: { id: string; name: string }[]): Item {
  return {
    pk: 'GAME',
    sk: gameRecordSk(META, 0, GAME_ID),
    id: GAME_ID,
    metaGame: META,
    numPlayers: players.length,
    players,
    clockHard: false,
    toMove: '0',
    lastMoveTime: Date.now(),
    state: '',
  };
}

function completedGame(players: { id: string; name: string }[], numMoves = 5): Item {
  return {
    pk: 'GAME',
    sk: gameRecordSk(META, 1, GAME_ID),
    id: GAME_ID,
    metaGame: META,
    numPlayers: players.length,
    players,
    clockHard: false,
    toMove: '',
    lastMoveTime: Date.now(),
    numMoves,
    gameStarted: 1,
    gameEnded: 2,
    state: '',
  };
}

function createMockDocClient(store: Map<string, Item>) {
  return {
    async send(command: GetCommand | PutCommand | DeleteCommand | QueryCommand | UpdateCommand) {
      if (command instanceof GetCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        const item = store.get(`${pk}:${sk}`);
        return { Item: item };
      }
      if (command instanceof PutCommand) {
        const item = command.input.Item as Item;
        store.set(itemKey(item), { ...item });
        return {};
      }
      if (command instanceof DeleteCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        store.delete(`${pk}:${sk}`);
        return {};
      }
      if (command instanceof QueryCommand) {
        const pk = (command.input.ExpressionAttributeValues as Record<string, string>)[':pk'];
        const skPrefix = (command.input.ExpressionAttributeValues as Record<string, string>)[':prefix'];
        const items = [...store.values()].filter(item => {
          if (item.pk !== pk) {
            return false;
          }
          if (skPrefix !== undefined) {
            return String(item.sk).startsWith(skPrefix);
          }
          return true;
        });
        if (command.input.Select === 'COUNT') {
          return { Count: items.length };
        }
        return { Items: items };
      }
      if (command instanceof UpdateCommand) {
        const { pk, sk } = command.input.Key as { pk: string; sk: string };
        const key = `${pk}:${sk}`;
        const existing = store.get(key) ?? { pk, sk };
        const values = command.input.ExpressionAttributeValues as Record<string, unknown>;
        if (command.input.UpdateExpression?.includes('lastChat')) {
          existing.lastChat = values[':lc'];
        }
        if (command.input.UpdateExpression?.includes('seen')) {
          existing.seen = values[':seen'];
        }
        store.set(key, existing);
        return {};
      }
      throw new Error('Unsupported command');
    },
  };
}

let store: Map<string, Item>;
let client: ReturnType<typeof createMockDocClient>;

beforeEach(() => {
  store = new Map();
  client = createMockDocClient(store);
});

afterEach(() => {
  store.clear();
});

test('participant cannot watch own game', async () => {
  const game = activeGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ]);
  store.set(itemKey(game), game);

  const result = await watchGame(client as any, TABLE, PLAYER_A, META, GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /cannot watch/i);
  }
});

test('non-participant can watch active game', async () => {
  const game = activeGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ]);
  store.set(itemKey(game), game);

  const result = await watchGame(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, true);
  assert.ok(store.has(`WATCHED#${SPECTATOR}:${GAME_ID}`));
  assert.ok(store.has(`GAMEWATCHERS#${GAME_ID}:${SPECTATOR}`));
});

test('non-participant can watch completed game', async () => {
  const game = completedGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ]);
  store.set(itemKey(game), game);

  const result = await watchGame(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, true);
});

test('highlight requires participation', async () => {
  const game = activeGame([{ id: PLAYER_A, name: 'mason' }, { id: PLAYER_B, name: 'Kapena' }]);
  store.set(itemKey(game), game);

  const denied = await highlightGame(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(denied.ok, false);

  const allowed = await highlightGame(client as any, TABLE, PLAYER_A, META, GAME_ID);
  assert.equal(allowed.ok, true);
  assert.ok(store.has(`HIGHLIGHT#${PLAYER_A}:${META}#${GAME_ID}`));
});

test('non-participant can recommend completed game', async () => {
  store.set(itemKey(userRecord(SPECTATOR, 'spectator')), userRecord(SPECTATOR, 'spectator'));
  const game = completedGame([
    { id: PLAYER_A, name: 'mason' },
    { id: PLAYER_B, name: 'Kapena' },
  ], 5);
  store.set(itemKey(game), game);

  const result = await recommendGame(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, true);
  assert.ok(store.has(`REPRESENTATIVE#${META}:${SPECTATOR}#${GAME_ID}`));
  assert.ok(store.has(`PLAYER#${SPECTATOR}:REPRESENTATIVE#${META}#${GAME_ID}`));
});

function userRecord(id: string, name: string): Item {
  return { pk: 'USER', sk: id, id, name };
}

test('recommend enforces two per metaGame', async () => {
  store.set(itemKey(userRecord(SPECTATOR, 'spectator')), userRecord(SPECTATOR, 'spectator'));
  const otherId1 = 'other-game-1';
  const otherId2 = 'other-game-2';
  store.set(itemKey({
    pk: `PLAYER#${SPECTATOR}`,
    sk: `REPRESENTATIVE#${META}#${otherId1}`,
    metaGame: META,
    gameId: otherId1,
  }), {
    pk: `PLAYER#${SPECTATOR}`,
    sk: `REPRESENTATIVE#${META}#${otherId1}`,
  });
  store.set(itemKey({
    pk: `PLAYER#${SPECTATOR}`,
    sk: `REPRESENTATIVE#${META}#${otherId2}`,
  }), {
    pk: `PLAYER#${SPECTATOR}`,
    sk: `REPRESENTATIVE#${META}#${otherId2}`,
  });

  const game = completedGame([{ id: PLAYER_A, name: 'mason' }, { id: PLAYER_B, name: 'Kapena' }], 5);
  store.set(itemKey(game), game);

  const count = await countUserRecommendationsForMetaGame(client as any, TABLE, SPECTATOR, META);
  assert.equal(count, 2);

  const result = await recommendGame(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /only recommend 2/i);
  }
});

test('recommend rejects in-progress game', async () => {
  store.set(itemKey(userRecord(SPECTATOR, 'spectator')), userRecord(SPECTATOR, 'spectator'));
  const game = activeGame([{ id: PLAYER_A, name: 'mason' }, { id: PLAYER_B, name: 'Kapena' }]);
  store.set(itemKey(game), game);

  const result = await recommendGame(client as any, TABLE, SPECTATOR, META, GAME_ID);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /completed/i);
  }
});

test('recommend rejects too-short completed game', () => {
  const source: GameMarkSource = {
    id: GAME_ID,
    metaGame: META,
    players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
    clockHard: false,
    toMove: '',
    lastMoveTime: 1,
    numPlayers: 2,
    numMoves: 2,
  };
  const summary = buildGameSummary(source);
  assert.equal(summary.gameEnded, 1);
  assert.equal(isQualityCompletedGame(source, summary), false);
});

test('buildGameSummary derives gameEnded for completed game when numMoves already set', () => {
  const source: GameMarkSource = {
    id: GAME_ID,
    metaGame: META,
    players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
    clockHard: false,
    toMove: '',
    lastMoveTime: 1234567890,
    numPlayers: 2,
    numMoves: 41,
  };
  const summary = buildGameSummary(source);
  assert.equal(summary.gameEnded, 1234567890);
  assert.equal(summary.toMove, undefined);
});

test('buildGameSummary preserves source gameEnded when present', () => {
  const source: GameMarkSource = {
    id: GAME_ID,
    metaGame: META,
    players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
    clockHard: false,
    toMove: '',
    lastMoveTime: 100,
    gameEnded: 999,
    numPlayers: 2,
    numMoves: 10,
  };
  const summary = buildGameSummary(source);
  assert.equal(summary.gameEnded, 999);
});

test('buildGameSummary does not set gameEnded for in-progress game', () => {
  const source: GameMarkSource = {
    id: GAME_ID,
    metaGame: META,
    players: [{ id: PLAYER_A, name: 'a' }, { id: PLAYER_B, name: 'b' }],
    clockHard: false,
    toMove: '0',
    lastMoveTime: 1234567890,
    numPlayers: 2,
    numMoves: 5,
  };
  const summary = buildGameSummary(source);
  assert.equal(summary.gameEnded, undefined);
  assert.equal(summary.toMove, '0');
});

test('updateLastChatForWatchers sets lastChat without seen for non-commenter', async () => {
  store.set(itemKey({
    pk: `GAMEWATCHERS#${GAME_ID}`,
    sk: SPECTATOR,
  }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: SPECTATOR });
  store.set(itemKey({
    pk: `WATCHED#${SPECTATOR}`,
    sk: GAME_ID,
    id: GAME_ID,
    metaGame: META,
  }), {
    pk: `WATCHED#${SPECTATOR}`,
    sk: GAME_ID,
    id: GAME_ID,
    metaGame: META,
  });

  await updateLastChatForWatchers(client as any, TABLE, GAME_ID, PLAYER_A);

  const watched = store.get(`WATCHED#${SPECTATOR}:${GAME_ID}`);
  assert.ok(watched?.lastChat);
  assert.equal(watched?.seen, undefined);
});

test('countGameWatchers returns watcher index size', async () => {
  store.set(itemKey({
    pk: `GAMEWATCHERS#${GAME_ID}`,
    sk: SPECTATOR,
  }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: SPECTATOR });
  store.set(itemKey({
    pk: `GAMEWATCHERS#${GAME_ID}`,
    sk: PLAYER_A,
  }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: PLAYER_A });

  const count = await countGameWatchers(client as any, TABLE, GAME_ID);
  assert.equal(count, 2);
});

test('updateLastChatForWatchers sets seen for commenter watcher', async () => {
  store.set(itemKey({
    pk: `GAMEWATCHERS#${GAME_ID}`,
    sk: SPECTATOR,
  }), { pk: `GAMEWATCHERS#${GAME_ID}`, sk: SPECTATOR });
  store.set(itemKey({
    pk: `WATCHED#${SPECTATOR}`,
    sk: GAME_ID,
    id: GAME_ID,
  }), {
    pk: `WATCHED#${SPECTATOR}`,
    sk: GAME_ID,
    id: GAME_ID,
  });

  await updateLastChatForWatchers(client as any, TABLE, GAME_ID, SPECTATOR);

  const watched = store.get(`WATCHED#${SPECTATOR}:${GAME_ID}`);
  assert.ok(watched?.lastChat);
  assert.ok(watched?.seen);
});
