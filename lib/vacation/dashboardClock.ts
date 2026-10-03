import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DashboardGame } from '../dashboardGames.js';
import { collectOnClockPlayerIdsFromGames } from './load.js';
import { enrichDashboardGamesClockDisplay } from './clockDisplay.js';
import {
  getVacationWindowFromMap,
  prepareVacationWindowsForPlayerIds,
} from './persist.js';

/** Load vacation windows for on-clock players and attach display fields. */
export async function attachDashboardGamesClockDisplay(
  client: DynamoDBDocumentClient,
  tableName: string,
  games: DashboardGame[],
  now: number,
): Promise<DashboardGame[]> {
  const onClockIds = collectOnClockPlayerIdsFromGames(games);
  const vacationWindows = await prepareVacationWindowsForPlayerIds(
    client,
    tableName,
    onClockIds,
    now,
  );
  return enrichDashboardGamesClockDisplay(
    games,
    now,
    getVacationWindowFromMap(vacationWindows),
  );
}
