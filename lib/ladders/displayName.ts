import { gameinfo } from '@abstractplay/gameslib';
import { batchRatingGameLabel } from '../batchRatings.js';

export function formatLadderDisplayName(metaGame: string, variants: string[]): string {
  const info = gameinfo.get(metaGame);
  const title = info?.name ?? metaGame;
  const label = batchRatingGameLabel(title, variants ?? []);
  return `Ladder: ${label}`;
}
