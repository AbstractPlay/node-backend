import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DashboardGame } from '../dashboardGames.js';
import { collectPlayerIdsFromGames } from './load.js';
import { enrichDashboardGamesClockDisplay } from './clockDisplay.js';
import {
  getPlayerVacationFlagsFromMap,
  getVacationWindowFromMap,
  prepareVacationPlayerStateForPlayerIds,
} from './persist.js';

/** Load vacation state for all players and attach display fields. */
export async function attachDashboardGamesClockDisplay(
  client: DynamoDBDocumentClient,
  tableName: string,
  games: DashboardGame[],
  now: number,
): Promise<DashboardGame[]> {
  const playerIds = collectPlayerIdsFromGames(games);
  const { windows, flags } = await prepareVacationPlayerStateForPlayerIds(
    client,
    tableName,
    playerIds,
    now,
  );
  return enrichDashboardGamesClockDisplay(
    games,
    now,
    getVacationWindowFromMap(windows),
    getPlayerVacationFlagsFromMap(flags),
  );
}
