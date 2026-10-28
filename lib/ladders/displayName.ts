import { addResource, expandVariantLabels, gameinfo, resolveGameName } from '@abstractplay/gameslib';

const LADDER_CORRESPONDENCE_PLAYERS = 2;

let gameslibLocaleReady = false;

function ensureGameslibLocales(): void {
  if (gameslibLocaleReady) {
    return;
  }
  addResource('en');
  gameslibLocaleReady = true;
}

/** Human-facing ladder title (matches front `formatVariantsJoined` + `Ladder.title*`). */
export function formatLadderDisplayName(metaGame: string, variants: string[]): string {
  ensureGameslibLocales();
  const info = gameinfo.get(metaGame);
  const title = resolveGameName(metaGame, info?.name ?? metaGame);
  const labels = expandVariantLabels(metaGame, LADDER_CORRESPONDENCE_PLAYERS, variants ?? []);
  const variantText = labels.join(', ');
  if (variantText.length === 0) {
    return `${title} ladder`;
  }
  return `${title} ladder (${variantText})`;
}

/** @internal Test-only reset for gameslib locale guard. */
export function resetLadderDisplayNameLocaleForTests(): void {
  gameslibLocaleReady = false;
}
