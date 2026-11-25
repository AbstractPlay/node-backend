import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { isActiveDashboardGame } from '../dashboardGames.js';
import { toCurrentSummary, type GameRecord } from '../gameProjector.js';
import { queryAllItems } from './dynamoPages.js';
import { getLadderRecord } from './ladderStore.js';
import {
  ladderGameRecordHasSnapshot,
  type LadderGameSnapshotAttrs,
} from './outcomeSnapshot.js';
import type { LadderGameRecord } from './types.js';

export const LADDER_ACTIVITY_WINDOW_DAYS = 30;
export const LADDER_ACTIVITY_OUTCOMES_CAP = 500;

export type LadderActivityActiveGame = ReturnType<typeof toCurrentSummary>;

export type LadderActivityOutcome =
  | ({ gameId: string; settledAt: number; snapshotComplete: true } & LadderGameSnapshotAttrs)
  | { gameId: string; settledAt: number; snapshotComplete: false };

export type LadderActivityResponse = {
  ladderId: string;
  metaGame: string;
  windowDays: number;
  activeGames: LadderActivityActiveGame[];
  outcomes: LadderActivityOutcome[];
};

function mapSettledRowToOutcome(row: LadderGameRecord): LadderActivityOutcome | undefined {
  const settledAt = row.settledAt;
  if (settledAt === undefined) {
    return undefined;
  }
  const gameId = row.gameId;
  if (!ladderGameRecordHasSnapshot(row)) {
    return { gameId, settledAt, snapshotComplete: false };
  }
  const {
    pk: _pk,
    sk: _sk,
    ladderId: _ladderId,
    gameId: _gameId,
    settled: _settled,
    settledAt: _settledAt,
    ...snapshotFields
  } = row;
  return {
    gameId,
    settledAt,
    snapshotComplete: true,
    ...(snapshotFields as LadderGameSnapshotAttrs),
  };
}

export async function getLadderActivityData(
  ladderId: string,
  now = Date.now(),
): Promise<LadderActivityResponse | undefined> {
  const ladder = await getLadderRecord(ladderId);
  if (ladder === undefined) {
    return undefined;
  }
  const tableName = process.env.ABSTRACT_PLAY_TABLE!;
  const cutoff = now - LADDER_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const metaGame = ladder.metaGame;

  const links = await queryAllItems(ddbDocClient, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': 'LADDERGAME', ':sk': `${ladderId}#` },
  }) as LadderGameRecord[];

  const openLinks = links.filter((lg) => lg.settled !== true);
  const outcomes = links
    .filter((lg) => lg.settled === true && (lg.settledAt ?? 0) >= cutoff)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .slice(0, LADDER_ACTIVITY_OUTCOMES_CAP)
    .map(mapSettledRowToOutcome)
  const outcomesClean = outcomes.filter(
    (row): row is LadderActivityOutcome => row !== undefined,
  );

  const activeGames: LadderActivityActiveGame[] = [];
  for (let i = 0; i < openLinks.length; i += 100) {
    const chunk = openLinks.slice(i, i + 100);
    const batch = await ddbDocClient.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map((link) => ({
            pk: 'GAME',
            sk: `${metaGame}#0#${link.gameId}`,
          })),
        },
      },
    }));
    const items = (batch.Responses?.[tableName] ?? []) as GameRecord[];
    for (const item of items) {
      if (!isActiveDashboardGame({ toMove: item.toMove })) {
        continue;
      }
      activeGames.push(toCurrentSummary(item));
    }
  }

  activeGames.sort((a, b) => (b.lastMoveTime ?? 0) - (a.lastMoveTime ?? 0));

  return {
    ladderId,
    metaGame,
    windowDays: LADDER_ACTIVITY_WINDOW_DAYS,
    activeGames,
    outcomes: outcomesClean,
  };
}