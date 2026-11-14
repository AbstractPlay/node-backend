import { repairTumbleweedFogStackJson } from '@abstractplay/gameslib';
import { decompressGameState } from '../../lib/gameState.ts';

/**
 * @param {string | undefined} recordVariantsJson
 * @param {string} storedState
 */
export function recordUsesFogVariant(recordVariants, storedState) {
  if (Array.isArray(recordVariants) && recordVariants.includes('fog')) {
    return true;
  }
  try {
    const parsed = JSON.parse(decompressGameState(storedState));
    return Array.isArray(parsed.variants) && parsed.variants.includes('fog');
  } catch {
    return false;
  }
}

/**
 * @param {string} stateJson
 */
export function patchTumbleweedFogMemory(stateJson) {
  const result = repairTumbleweedFogStackJson(stateJson);
  return {
    changed: result.repaired,
    stateJson: result.stateJson,
    reason: result.reason,
  };
}