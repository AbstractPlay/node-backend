import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { GameFactory } from '@abstractplay/gameslib';
import {
  hasStartPositionPayload,
  normalizeStartPositionChallengeFields,
  validateStartPositionChallengeShape,
  validateStartPositionForIssue,
  resolveStartFromPosition,
  prepareChallengePositionState,
  deleteChallengePositionWhenFlagged,
  CHALLENGE_POSITION_PK,
} from '../lib/challenges/startPosition.js';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

function saltireOpeningState(): string {
  const engine = GameFactory('saltire', undefined, []);
  assert.ok(engine);
  return engine.serialize();
}

describe('start position challenge issue', () => {
  it('detects startPosition payload', () => {
    assert.equal(hasStartPositionPayload({}), false);
    assert.equal(hasStartPositionPayload({ startPosition: { state: '' } }), false);
    assert.equal(hasStartPositionPayload({ startPosition: { state: '{}' } }), true);
  });

  it('forces teaching mode and unrated when startPosition is set', () => {
    const challenge = {
      metaGame: 'saltire',
      numPlayers: 2,
      rated: true,
      teachingMode: false,
      startPosition: { state: saltireOpeningState() },
    };
    normalizeStartPositionChallengeFields(challenge);
    assert.equal(challenge.teachingMode, true);
    assert.equal(challenge.rated, false);
  });

  it('allows standing 2P and rejects open slots', () => {
    const base = {
      metaGame: 'saltire',
      numPlayers: 2,
      rated: false,
      startPosition: { state: saltireOpeningState() },
    };
    assert.equal(validateStartPositionChallengeShape({ ...base, standing: true }), null);
    assert.match(
      validateStartPositionChallengeShape({ ...base, openSlots: 1 }) ?? '',
      /open seat/i,
    );
    assert.match(
      validateStartPositionChallengeShape({ ...base, numPlayers: 3 }) ?? '',
      /two-player/i,
    );
  });

  it('accepts valid saltire opening state', () => {
    const state = saltireOpeningState();
    assert.equal(validateStartPositionForIssue('saltire', 2, [], state), null);
  });

  it('rejects finished positions', () => {
    const engine = GameFactory('saltire', undefined, []);
    assert.ok(engine);
    engine.gameover = true;
    const err = validateStartPositionForIssue('saltire', 2, [], engine.serialize());
    assert.match(err ?? '', /finished/i);
  });

  it('rejects simultaneous games', () => {
    const err = validateStartPositionForIssue('assembly', 2, [], saltireOpeningState());
    assert.match(err ?? '', /simultaneous/i);
  });

  it('resolveStartFromPosition derives toMove from engine', () => {
    const state = saltireOpeningState();
    const resolved = resolveStartFromPosition('saltire', [], state);
    assert.equal(typeof resolved.toMove, 'string');
    assert.equal(resolved.state, state);
    assert.ok(resolved.engine);
  });

  it('prepareChallengePositionState leaves small state unchanged', () => {
    const state = saltireOpeningState();
    assert.equal(prepareChallengePositionState(state), state);
  });

  it('deleteChallengePositionWhenFlagged no-ops without flag', async () => {
    const sends: unknown[] = [];
    const client = {
      send: async (cmd: unknown) => {
        sends.push(cmd);
      },
    };
    await deleteChallengePositionWhenFlagged(
      client as never,
      't',
      'id-1',
      false,
    );
    assert.equal(sends.length, 0);
  });

  it('deleteChallengePositionWhenFlagged deletes when flagged', async () => {
    const sends: unknown[] = [];
    const client = {
      send: async (cmd: unknown) => {
        sends.push(cmd);
      },
    };
    await deleteChallengePositionWhenFlagged(
      client as never,
      't',
      'id-1',
      true,
    );
    assert.equal(sends.length, 1);
    const del = sends[0] as DeleteCommand;
    assert.equal(del.input.Key?.pk, CHALLENGE_POSITION_PK);
    assert.equal(del.input.Key?.sk, 'id-1');
  });
});
