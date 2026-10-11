import { describe, it, vi, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { GameFactory, trailingSameActorRun, type GameBase, type IGamePly } from '@abstractplay/gameslib';
import {
  normalizeTeachingChallengeFields,
  validateTeachingChallengeSync,
  validateTeachingChallengeIssue,
} from '../lib/challenges/teachingModeEligible.js';
import {
  captureTeachingPlyStart,
  enginePlies,
  lastPlyActor,
  restoreTeachingClocks,
  rollbackEngineToStackLength,
  shouldRefreshPlyStart,
  targetStackLengthForUndo,
  teachingReviewerSeat0,
  trimExplorationAfterStack,
  undoTargetStackLengthForReviewer,
  grantTeachingUndoInPlace,
  keepTeachingMoveInPlace,
  undoTeachingMoveInPlace,
  teachingReviewBlocksPlay,
  TEACHING_REVIEW_PLAY_BLOCKED_MESSAGE,
  type TeachingPlayGame,
} from '../lib/games/teachingMode.js';

vi.mock('../lib/participants.js', () => ({
  isBotId: vi.fn(async (id: string) => id.startsWith('bot-')),
}));

function saltireEngine(): GameBase & { moves(): string[] } {
  const engine = GameFactory('saltire', undefined, []);
  assert.ok(engine);
  return engine as GameBase & { moves(): string[] };
}

function ply(actor: number, stackIndex: number): IGamePly {
  return {
    actor,
    stackIndex,
    move: 'x',
    results: [],
    round: 0,
    playOrder: stackIndex,
  };
}

describe('teaching mode challenge eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces rated false when teachingMode is set', () => {
    const challenge = { teachingMode: true, rated: true };
    normalizeTeachingChallengeFields(challenge);
    assert.equal(challenge.rated, false);
  });

  it('allows two-player sequential saltire', () => {
    assert.equal(validateTeachingChallengeSync('saltire', 2, []), null);
  });

  it('rejects non-two-player games', () => {
    assert.match(
      validateTeachingChallengeSync('saltire', 3, []) ?? '',
      /two-player/i,
    );
  });

  it('rejects simultaneous games', () => {
    assert.match(
      validateTeachingChallengeSync('assembly', 2, []) ?? '',
      /simultaneous/i,
    );
  });

  it('rejects bot opponents at issue time', async () => {
    const err = await validateTeachingChallengeIssue({
      teachingMode: true,
      metaGame: 'saltire',
      numPlayers: 2,
      variants: [],
      challenger: { id: 'human-1' },
      challengees: [{ id: 'bot-2' }],
    });
    assert.match(err ?? '', /bot/i);
  });

  it('passes for valid human-only teaching challenge', async () => {
    const err = await validateTeachingChallengeIssue({
      teachingMode: true,
      metaGame: 'saltire',
      numPlayers: 2,
      variants: [],
      challenger: { id: 'human-1' },
      challengees: [{ id: 'human-2' }],
    });
    assert.equal(err, null);
  });
});

describe('teaching review play gate', () => {
  it('blocks normal play while teachingUndo is set', () => {
    assert.equal(teachingReviewBlocksPlay({}), null);
    assert.equal(
      teachingReviewBlocksPlay({
        teachingUndo: {
          grantorSeat: 1,
          reviewerSeat: 0,
          stackAtGrant: 3,
          grantorSeatAfterKeep: 1,
        },
      }),
      TEACHING_REVIEW_PLAY_BLOCKED_MESSAGE,
    );
  });
});

describe('teaching mode rollback helpers', () => {
  it('lastPlyActor and reviewer seat after a saltire move', () => {
    const engine = saltireEngine();
    const first = engine.moves()[0];
    engine.move(first);
    assert.equal(lastPlyActor(engine), 1);
    assert.equal(teachingReviewerSeat0(engine, 1), 0);
  });

  it('shouldRefreshPlyStart when opponent is on clock', () => {
    const plies = [ply(1, 1)];
    assert.equal(shouldRefreshPlyStart(plies, 1), true);
    assert.equal(shouldRefreshPlyStart(plies, 0), false);
  });

  it('trailing same-actor run targets stack before first ply in run', () => {
    const plies = [ply(1, 1), ply(2, 2), ply(2, 3)];
    const run = trailingSameActorRun(plies, 2);
    assert.ok(run);
    assert.equal(targetStackLengthForUndo(run!), 2);
    assert.equal(undoTargetStackLengthForReviewer({ stack: [{}, {}, {}], getPlies: () => plies } as never, 2), 2);
  });

  it('rollbackEngineToStackLength pops via undo', () => {
    const engine = saltireEngine();
    engine.move(engine.moves()[0]);
    engine.move(engine.moves()[0]);
    assert.equal(engine.stack.length, 3);
    rollbackEngineToStackLength(engine, 2);
    assert.equal(engine.stack.length, 2);
  });

  it('restoreTeachingClocks copies snapshot times', () => {
    const game = {
      players: [{ time: 100 }, { time: 200 }],
      lastMoveTime: 50,
    };
    restoreTeachingClocks(game, {
      stackIndex: 2,
      playerTimes: [900, 800],
      lastMoveTime: 77,
    });
    assert.deepEqual(game.players.map((p) => p.time), [900, 800]);
    assert.equal(game.lastMoveTime, 77);
  });

  it('captureTeachingPlyStart records stack tip and clocks', () => {
    const engine = saltireEngine();
    const game = {
      players: [{ time: 1 }, { time: 2 }],
      lastMoveTime: 10,
    };
    const snap = captureTeachingPlyStart(game, engine);
    assert.equal(snap.stackIndex, 1);
    assert.deepEqual(snap.playerTimes, [1, 2]);
    assert.equal(enginePlies(engine).length, 0);
  });

  it('trimExplorationAfterStack deletes rows at or above move index', async () => {
    const sends: unknown[] = [];
    const client = {
      send: vi.fn(async (cmd: { constructor: { name: string }; input?: unknown }) => {
        sends.push(cmd);
        if (cmd.constructor.name === 'QueryCommand') {
          return {
            Items: [
              { pk: 'GAMEEXPLORATION#g1', sk: 'u1#1', move: 1 },
              { pk: 'GAMEEXPLORATION#g1', sk: 'u1#2', move: 2 },
              { pk: 'GAMEEXPLORATION#g1', sk: 'u2#2', move: 2 },
            ],
          };
        }
        return {};
      }),
    };
    await trimExplorationAfterStack(client as never, 'TABLE', 'g1', 2);
    const batch = sends.find((c) => (c as { constructor: { name: string } }).constructor.name === 'BatchWriteCommand') as {
      input: { RequestItems: { TABLE: { DeleteRequest: { Key: { sk: string } } }[] } };
    };
    assert.ok(batch);
    const keys = batch.input.RequestItems.TABLE.map((r) => r.DeleteRequest.Key.sk);
    assert.deepEqual(keys.sort(), ['u1#2', 'u2#2']);
  });
});

function teachingPlayGame(
  engine: GameBase & { moves(): string[] },
  overrides: Partial<TeachingPlayGame> = {},
): TeachingPlayGame {
  return {
    pk: 'GAME',
    sk: 'saltire#0#t1',
    id: 't1',
    metaGame: 'saltire',
    numPlayers: 2,
    clockHard: false,
    teachingMode: true,
    players: [{ id: 'p0', time: 3600000 }, { id: 'p1', time: 3600000 }],
    toMove: '0',
    lastMoveTime: 1_000,
    state: engine.serialize(),
    ...overrides,
  };
}

describe('teaching mode grant / keep / undo', () => {
  it('keep leaves stack unchanged and returns clock to grantor', () => {
    const engine = saltireEngine();
    engine.move(engine.moves()[0]);
    engine.move(engine.moves()[0]);
    const stackBefore = engine.stack.length;
    const game = teachingPlayGame(engine, { toMove: '0' });
    assert.equal(grantTeachingUndoInPlace(game, engine, 0), null);
    assert.equal(game.toMove, '1');
    assert.equal(keepTeachingMoveInPlace(game), null);
    assert.equal(game.toMove, '0');
    assert.equal(engine.stack.length, stackBefore);
    assert.equal(game.teachingUndo, undefined);
  });

  it('undo shrinks stack and sets reviewer to move', () => {
    const engine = saltireEngine();
    engine.move(engine.moves()[0]);
    engine.move(engine.moves()[0]);
    const game = teachingPlayGame(engine, {
      toMove: '0',
      teachingPlyStart: {
        stackIndex: 2,
        playerTimes: [3600000, 3600000],
        lastMoveTime: 500,
      },
    });
    grantTeachingUndoInPlace(game, engine, 0);
    assert.equal(undoTeachingMoveInPlace(game, engine), null);
    assert.equal(engine.stack.length, 2);
    assert.equal(game.toMove, '1');
    assert.equal(game.teachingPlyStart, undefined);
  });

  it('chains grant and undo across three steps', () => {
    const engine = saltireEngine();
    engine.move(engine.moves()[0]);
    engine.move(engine.moves()[0]);
    engine.move(engine.moves()[0]);
    let game = teachingPlayGame(engine, { toMove: '1' });
    assert.equal(grantTeachingUndoInPlace(game, engine, 1), null);
    assert.equal(undoTeachingMoveInPlace(game, engine), null);
    assert.equal(engine.stack.length, 3);
    assert.equal(game.toMove, '0');
    assert.equal(grantTeachingUndoInPlace(game, engine, 0), null);
    assert.equal(undoTeachingMoveInPlace(game, engine), null);
    assert.equal(engine.stack.length, 2);
    assert.equal(game.toMove, '1');
    assert.equal(grantTeachingUndoInPlace(game, engine, 1), null);
    assert.equal(undoTeachingMoveInPlace(game, engine), null);
    assert.equal(engine.stack.length, 1);
    assert.equal(game.toMove, '0');
  });

  it('rejects grant at opening', () => {
    const engine = saltireEngine();
    const game = teachingPlayGame(engine, { toMove: '0' });
    assert.match(grantTeachingUndoInPlace(game, engine, 0) ?? '', /no move/i);
  });

  it('undoes trailing same-actor plies in one step', () => {
    const plies = [ply(1, 1), ply(2, 2), ply(2, 3)];
    const stack = [{}, {}, {}, {}];
    const engine = {
      stack,
      gameover: false,
      winner: [],
      serialize: () => 'fixed',
      undo() {
        stack.pop();
      },
      getPlies: () => plies,
    } as unknown as GameBase;
    const game = teachingPlayGame(engine as unknown as GameBase & { moves(): string[] }, {
      toMove: '0',
      state: 'fixed',
    });
    game.teachingUndo = {
      grantorSeat: 0,
      reviewerSeat: 1,
      stackAtGrant: 4,
      grantorSeatAfterKeep: 0,
    };
    assert.equal(undoTeachingMoveInPlace(game, engine), null);
    assert.equal(engine.stack.length, 2);
    assert.equal(game.toMove, '1');
  });
});
