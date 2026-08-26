import { gameinfo } from '@abstractplay/gameslib';

/** Whether automated tournaments can run for this title (requires `playercount: 2`). */
export const tournamentPlaySupported = (metaGame: string): boolean => {
  const info = gameinfo.get(metaGame);
  return info !== undefined && info.playercounts.includes(2);
};
