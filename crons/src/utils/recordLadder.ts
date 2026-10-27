import { formatLadderDisplayName } from '@backend/lib/ladders/displayName.js';

export type LadderDumpRow = {
  pk: 'LADDER';
  sk: string;
  id?: string;
  metaGame: string;
  variants?: string[];
};

export function findLadderForGame(
  ladders: LadderDumpRow[],
  ladderId: string,
): LadderDumpRow | undefined {
  return ladders.find(l => l.sk === ladderId || l.id === ladderId);
}

/** Records `header.event` label for a rated ladder game. */
export function ladderEventLabelForGame(
  ladders: LadderDumpRow[],
  ladderId: string,
  metaGame?: string,
  variants?: string[],
): string {
  const ladder = findLadderForGame(ladders, ladderId);
  const mg = metaGame ?? ladder?.metaGame;
  const vars = variants ?? ladder?.variants ?? [];
  if (mg !== undefined && mg.length > 0) {
    return formatLadderDisplayName(mg, vars);
  }
  console.warn(`ladderEventLabelForGame: missing meta for ladder ${ladderId}`);
  return `Ladder (${ladderId})`;
}
