export type PlayMode = 'arena' | 'correspondence';

export type ArenaClockSnapshot = {
  startSec: number;
  incSec: number;
  maxSec: number;
};

export type ArenaGameFields = {
  playMode?: PlayMode;
  arenaTcId?: string;
  arenaClock?: ArenaClockSnapshot;
  clockGeneration?: number;
};

export function isArenaGame(game: { playMode?: string | PlayMode } | null | undefined): boolean {
  return game?.playMode === 'arena';
}

/** Legacy rows omit playMode — treat as correspondence. */
export function playModeOf(game: ArenaGameFields | null | undefined): PlayMode {
  return isArenaGame(game) ? 'arena' : 'correspondence';
}
