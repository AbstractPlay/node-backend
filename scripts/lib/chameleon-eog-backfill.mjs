/**
 * @typedef {{ stateJson: string; changed: boolean; from?: string; to?: string; reason?: string }} ChameleonEogPatchResult
 */

import { GameFactory } from '@abstractplay/gameslib';

/**
 * If the terminal stack frame's `eog.reason` disagrees with a fresh chameleon engine
 * (`GameFactory` + `expectedEogOutcome` on the tip), patch only that result entry.
 *
 * @param {string} stateJson
 * @returns {ChameleonEogPatchResult}
 */
export function patchChameleonTerminalEogReason(stateJson) {
  const engine = GameFactory('chameleon', stateJson);
  if (engine === undefined) {
    return { stateJson, changed: false, reason: 'GameFactory(chameleon) failed' };
  }
  if (!engine.gameover) {
    return { stateJson, changed: false, reason: 'not terminal' };
  }
  const tip = engine.stack[engine.stack.length - 1];
  if (tip === undefined) {
    return { stateJson, changed: false, reason: 'empty stack' };
  }
  const results = tip._results ?? [];
  const eog = results.find((r) => r.type === 'eog');
  if (eog === undefined || eog.reason === undefined) {
    return { stateJson, changed: false, reason: 'no eog result' };
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
  if (JSON.stringify(expected.winner) !== JSON.stringify(engine.winner)) {
    return {
      stateJson,
      changed: false,
      reason: `winner mismatch (stored ${JSON.stringify(engine.winner)} vs expected ${JSON.stringify(expected.winner)})`,
    };
  }
  if (eog.reason === expected.reason) {
    return { stateJson, changed: false };
  }

  const patched = GameFactory('chameleon', stateJson);
  if (patched === undefined) {
    return { stateJson, changed: false, reason: 'GameFactory(chameleon) failed on patch' };
  }
  const tipIdx = patched.stack.length - 1;
  const tipFrame = patched.stack[tipIdx];
  const patchedResults = (tipFrame._results ?? []).map((r) => (
    r.type === 'eog' ? { ...r, reason: expected.reason } : r
  ));
  patched.stack[tipIdx] = { ...tipFrame, _results: patchedResults };

  return {
    stateJson: patched.serialize(),
    changed: true,
    from: eog.reason,
    to: expected.reason,
  };
}
