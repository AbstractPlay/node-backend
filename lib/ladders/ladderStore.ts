import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient } from '../ddb.js';
import { formatLadderDisplayName } from './displayName.js';
import { rankLadderMembers } from './rank.js';
import type {
  LadderBoardEntry,
  LadderPlayerRecord,
  LadderRecord,
  LadderSeriesRecord,
  LadderViewerInfo,
} from './types.js';
import { ladderPlayerSk, ladderSeriesSk } from './keys.js';

const TABLE = () => process.env.ABSTRACT_PLAY_TABLE!;

export async function getLadderRecord(ladderId: string): Promise<LadderRecord | undefined> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: TABLE(),
    Key: { pk: 'LADDER', sk: ladderId },
  }));
  return result.Item as LadderRecord | undefined;
}

export async function getLadderSeriesByKey(seriesSk: string): Promise<LadderSeriesRecord | undefined> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: TABLE(),
    Key: { pk: 'LADDERSERIES', sk: seriesSk },
  }));
  return result.Item as LadderSeriesRecord | undefined;
}

export async function queryLadderPlayers(ladderId: string): Promise<LadderPlayerRecord[]> {
  const items: LadderPlayerRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'LADDERPLAYER', ':sk': `${ladderId}#` },
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items) {
      items.push(...result.Items as LadderPlayerRecord[]);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function getLadderPlayer(
  ladderId: string,
  userid: string,
): Promise<LadderPlayerRecord | undefined> {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: TABLE(),
    Key: { pk: 'LADDERPLAYER', sk: ladderPlayerSk(ladderId, userid) },
  }));
  return result.Item as LadderPlayerRecord | undefined;
}

export async function listAllLadders(): Promise<LadderRecord[]> {
  const items: LadderRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': 'LADDER' },
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items) {
      items.push(...result.Items as LadderRecord[]);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export function buildLadderBoard(
  players: LadderPlayerRecord[],
  maxRows = 500,
): LadderBoardEntry[] {
  const ranks = rankLadderMembers(players);
  const active = players.filter((p) => p.membershipStatus === 'active');
  const sorted = [...active].sort((a, b) => {
    const ra = ranks.get(a.userid) ?? 9999;
    const rb = ranks.get(b.userid) ?? 9999;
    return ra - rb;
  });
  const slice = sorted.slice(0, maxRows);
  return slice.map((p) => ({
    userid: p.userid,
    points: p.points,
    rank: ranks.get(p.userid) ?? 0,
    activeLadderGameCount: p.activeLadderGameCount ?? 0,
  }));
}

export function buildLadderViewer(
  players: LadderPlayerRecord[],
  viewerUserId: string | undefined,
): LadderViewerInfo | undefined {
  if (viewerUserId === undefined) {
    return undefined;
  }
  const row = players.find((p) => p.userid === viewerUserId);
  if (row === undefined) {
    return undefined;
  }
  const ranks = rankLadderMembers(players);
  const rank = row.membershipStatus === 'active' ? ranks.get(viewerUserId) : undefined;
  return {
    membershipStatus: row.membershipStatus,
    points: row.points,
    rank,
  };
}

export function ladderToListItem(ladder: LadderRecord) {
  return {
    ladderId: ladder.id,
    displayName: formatLadderDisplayName(ladder.metaGame, ladder.variants),
    metaGame: ladder.metaGame,
    variants: ladder.variants,
    status: ladder.status,
    activeMemberCount: ladder.activeMemberCount,
    minActiveMembers: ladder.minActiveMembers,
    seriesKey: ladderSeriesSk(ladder.metaGame, ladder.variants),
    activeMemberIds: ladder.activeMemberIds ?? [],
  };
}