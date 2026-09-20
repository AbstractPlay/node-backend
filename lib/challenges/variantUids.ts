import { gameinfo, validateVariantSelection } from '@abstractplay/gameslib';
import { headers } from '../api/http.js';
import { isMetaGamePlayableOnStage } from '../metaGameRetraction.js';

export function validateChallengeVariantUids(metaGame: string, variants: string[] | undefined) {
  if (!isMetaGamePlayableOnStage(metaGame)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Meta game unavailable: ${metaGame}` }),
      headers,
    };
  }
  const info = gameinfo.get(metaGame);
  if (!info) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Unknown metaGame: ${metaGame}` }),
      headers,
    };
  }
  const allowed = new Set((info.variants ?? []).map((v: { uid: string }) => v.uid));
  const disallowed = (variants ?? []).filter((v) => !allowed.has(v));
  if (disallowed.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: `Variant(s) not allowed: ${disallowed.join(', ')}` }),
      headers,
    };
  }
  const constraintResult = validateVariantSelection(info.variants ?? [], variants ?? []);
  if (!constraintResult.ok) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'INVALID_VARIANT_COMBINATION' }),
      headers,
    };
  }
  return undefined;
}
