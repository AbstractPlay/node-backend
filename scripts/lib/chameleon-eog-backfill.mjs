/**
 * @typedef {{ stateJson: string; changed: boolean; from?: string; to?: string; reason?: string }} ChameleonEogPatchResult
 */

import { GameFactory, replacer, reviver } from '@abstractplay/gameslib';

/**
 * If the terminal stack frame's `eog.reason` disagrees with a fresh chameleon engine
 * (`GameFactory` + `expectedEogOutcome` on the tip), patch only that result entry.
 *
 * @param {string} stateJson
 * @returns {ChameleonEogPatchResult}
 */
export function patchChameleonTerminalEogReason(stateJson) {
  let state;
  try {
    state = JSON.parse(stateJson, reviver);
  } catch {
    return { stateJson, changed: false, reason: 'invalid json' };
  }
  if (state.game !== 'chameleon') {
    return { stateJson, changed: false, reason: 'not chameleon' };
  }
  if (!state.gameover) {
    return { stateJson, changed: false, reason: 'not terminal' };
  }
  const tip = state.stack?.[state.stack.length - 1];
  if (tip === undefined) {
    return { stateJson, changed: false, reason: 'empty stack' };
  }
  const results = tip._results ?? [];
  const eog = results.find((r) => r.type === 'eog');
  if (eog === undefined || eog.reason === undefined) {
    return { stateJson, changed: false, reason: 'no eog result' };
  }

  const engine = GameFactory('chameleon', state);
  if (engine === undefined) {
    return { stateJson, changed: false, reason: 'GameFactory(chameleon) failed' };
  }
  if (typeof engine.expectedEogOutcome !== 'function') {
    return {
      stateJson,
      changed: false,
      reason: 'gameslib too old: chameleon engine has no expectedEogOutcome()',
    };
  }
  engine.load(-1);
  const expected = engine.expectedEogOutcome();
  if (expected === undefined) {
    return { stateJson, changed: false, reason: 'no expected outcome' };
  }
  if (JSON.stringify(expected.winner) !== JSON.stringify(state.winner)) {
    return {
      stateJson,
      changed: false,
      reason: `winner mismatch (stored ${JSON.stringify(state.winner)} vs expected ${JSON.stringify(expected.winner)})`,
    };
  }
  if (eog.reason === expected.reason) {
    return { stateJson, changed: false };
  }

  const patchedResults = results.map((r) => (
    r.type === 'eog' ? { ...r, reason: expected.reason } : r
  ));
  const patchedStack = [...state.stack];
  patchedStack[patchedStack.length - 1] = { ...tip, _results: patchedResults };
  const patchedState = { ...state, stack: patchedStack };
  const nextJson = JSON.stringify(patchedState, replacer);

  return {
    stateJson: nextJson,
    changed: true,
    from: eog.reason,
    to: expected.reason,
  };
}
