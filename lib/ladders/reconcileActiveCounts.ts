import {
  BatchGetCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { isActiveDashboardGame } from '../dashboardGames.js';
import { parseGameSk } from '../gameProjector.js';
import { queryAllItems } from './dynamoPages.js';
import type { LadderGameRecord, LadderPlayerRecord, LadderRecord } from './types.js';

export type LadderReconcileCorrection = {
  ladderId: string;
  userid: string;
  stored: number;
  expected: number;
};

export type LadderReconcileReport = {
  generatedAt: string;
  playersScanned: number;
  openLadderGamesScanned: number;
  driftCorrections: number;
  overCapIncidents: number;
  zeroDrift: boolean;
  corrections: LadderReconcileCorrection[];
};

function playerCountKey(ladderId: string, userid: string): string {
  return `${ladderId}#${userid}`;
}

async function loadLadderMap(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<Map<string, LadderRecord>> {
  const rows = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': 'LADDER' },
  });
  const map = new Map<string, LadderRecord>();
  for (const row of rows) {
    const ladder = row as LadderRecord;
    map.set(ladder.sk, ladder);
  }
  return map;
}

export async function buildOpenLadderGameCounts(
  client: DynamoDBDocumentClient,
  tableName: string,
  ladders: Map<string, LadderRecord>,
): Promise<{ counts: Map<string, number>; openRows: number }> {
  const counts = new Map<string, number>();
  const ladderGames = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': 'LADDERGAME' },
  });

  const openLinks: { ladderId: string; gameId: string; metaGame: string }[] = [];
  for (const row of ladderGames) {
    const lg = row as LadderGameRecord;
    if (lg.settled === true) {
      continue;
    }
    const ladder = ladders.get(lg.ladderId);
    if (ladder === undefined) {
      continue;
    }
    openLinks.push({
      ladderId: lg.ladderId,
      gameId: lg.gameId,
      metaGame: ladder.metaGame,
    });
  }

  for (let i = 0; i < openLinks.length; i += 100) {
    const chunk = openLinks.slice(i, i + 100);
    const data = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(link => ({
            pk: 'GAME',
            sk: `${link.metaGame}#0#${link.gameId}`,
          })),
        },
      },
    }));
    const linkByGameId = new Map(chunk.map(c => [c.gameId, c]));
    const items = data.Responses?.[tableName] ?? [];
    for (const item of items) {
      const sk = String(item.sk ?? '');
      const parts = parseGameSk(sk);
      if (parts === null) {
        continue;
      }
      if (!isActiveDashboardGame({ toMove: item.toMove as string | boolean[] | undefined })) {
        continue;
      }
      const link = linkByGameId.get(parts.gameId);
      if (link === undefined) {
        continue;
      }
      const ladderId = link.ladderId;
      const players = item.players as { id: string }[] | undefined;
      if (!Array.isArray(players)) {
        continue;
      }
      for (const p of players) {
        const key = playerCountKey(ladderId, p.id);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return { counts, openRows: openLinks.length };
}

export async function reconcileLadderActiveCounts(
  client: DynamoDBDocumentClient,
  tableName: string,
  options: { fix: boolean; ladderId?: string } = { fix: true },
): Promise<LadderReconcileReport> {
  const ladders = await loadLadderMap(client, tableName);
  const { counts: expectedCounts, openRows } = await buildOpenLadderGameCounts(
    client,
    tableName,
    ladders,
  );

  const corrections: LadderReconcileCorrection[] = [];
  let playersScanned = 0;
  let overCapIncidents = 0;

  let queryParams: QueryCommandInput;
  if (options.ladderId !== undefined) {
    queryParams = {
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'LADDERPLAYER', ':sk': `${options.ladderId}#` },
    };
  } else {
    queryParams = {
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': 'LADDERPLAYER' },
    };
  }

  const players = await queryAllItems(client, queryParams);

  for (const row of players) {
    playersScanned += 1;
    const player = row as LadderPlayerRecord;
    const ladderId = player.ladderId ?? player.sk.split('#')[0]!;
    const key = playerCountKey(ladderId, player.userid);
    const expected = expectedCounts.get(key) ?? 0;
    const stored = player.activeLadderGameCount ?? 0;
    if (stored === expected) {
      continue;
    }
    corrections.push({ ladderId, userid: player.userid, stored, expected });
    if (expected > 7 || stored < 0) {
      overCapIncidents += 1;
      console.error(`LadderActiveCountOverCap ladder=${ladderId} user=${player.userid} stored=${stored} expected=${expected}`);
    } else {
      console.warn(`LadderActiveCountDrift ladder=${ladderId} user=${player.userid} stored=${stored} expected=${expected}`);
    }
    if (options.fix) {
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: 'LADDERPLAYER', sk: player.sk },
        UpdateExpression: 'SET activeLadderGameCount = :e',
        ExpressionAttributeValues: { ':e': expected },
      }));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    playersScanned,
    openLadderGamesScanned: openRows,
    driftCorrections: corrections.length,
    overCapIncidents,
    zeroDrift: corrections.length === 0,
    corrections,
  };
}
