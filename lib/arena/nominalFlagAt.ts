import { isPlayerOnClock, type ClockGameSlice } from '../clockElapsed.js';

/** When the first on-clock bank hits zero (ms since epoch), before grace. */
export function nominalArenaFlagAtMs(
  game: Pick<ClockGameSlice, 'players' | 'toMove' | 'lastMoveTime'>,
): number | null {
  const { toMove, lastMoveTime, players } = game;
  if (toMove === undefined || toMove === '' || toMove === null) {
    return null;
  }

  let minFlag: number | null = null;
  const consider = (playerIndex: number) => {
    const bank = players[playerIndex]?.time ?? 0;
    const flagAt = bank <= 0 ? lastMoveTime : lastMoveTime + bank;
    if (minFlag === null || flagAt < minFlag) {
      minFlag = flagAt;
    }
  };

  if (Array.isArray(toMove)) {
    toMove.forEach((onClock, i) => {
      if (onClock) {
        consider(i);
      }
    });
  } else {
    const idx = Number.parseInt(String(toMove), 10);
    if (Number.isFinite(idx) && isPlayerOnClock(game, idx)) {
      consider(idx);
    }
  }

  return minFlag;
}
