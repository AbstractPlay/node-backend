import {
  BatchGetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { listCurrentTournamentRefsForUser } from './byUserIndex.js';
import { normalizeMatchLegs } from './matchLegs.js';

export type DashboardTournamentDivision = {
  numGames: number;
  numCompleted: number;
  processed?: boolean;
};

export type DashboardCurrentTournament = {
  id: string;
  metaGame: string;
  variants: string[];
  number: number;
  matchLegs?: 1 | 2;
  dateStarted?: number;
  divisions: Record<string, DashboardTournamentDivision>;
  players: string[];
};

type TournamentRecord = {
  id?: string;
  metaGame?: string;
  variants?: string[];
  number?: number;
  matchLegs?: 1 | 2;
  dateStarted?: number;
  dateEnded?: number;
  started?: boolean;
  divisions?: Record<string, DashboardTournamentDivision>;
};

type TournamentPlayerRow = {
  playerid?: string;
  division?: number;
};

async function queryAllItems(
  client: DynamoDBDocumentClient,
  params: QueryCommandInput,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(new QueryCommand({
      ...params,
      ExclusiveStartKey: lastKey,
    }));
    if (result.Items) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function loadTournamentsById(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentIds: string[],
): Promise<Map<string, TournamentRecord>> {
  const map = new Map<string, TournamentRecord>();
  for (let i = 0; i < tournamentIds.length; i += 100) {
    const chunk = tournamentIds.slice(i, i + 100);
    if (chunk.length === 0) {
      continue;
    }
    const data = await client.send(new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: chunk.map(id => ({ pk: 'TOURNAMENT', sk: id })),
        },
      },
    }));
    for (const item of data.Responses?.[tableName] ?? []) {
      const id = String(item.sk);
      map.set(id, item as TournamentRecord);
    }
  }
  return map;
}

async function listAssignedPlayerIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
): Promise<string[]> {
  const rows = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk and begins_with(#sk, :sk)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: {
      ':pk': 'TOURNAMENTPLAYER',
      ':sk': `${tournamentId}#`,
    },
  });
  const ids: string[] = [];
  for (const row of rows) {
    const player = row as TournamentPlayerRow;
    if (player.division === undefined || player.division === null) {
      continue;
    }
    if (typeof player.playerid === 'string' && player.playerid.length > 0) {
      ids.push(player.playerid);
    }
  }
  return ids;
}

function toDashboardTournament(
  tournamentId: string,
  tournament: TournamentRecord,
  players: string[],
): DashboardCurrentTournament {
  const matchLegs = normalizeMatchLegs(tournament.matchLegs);
  return {
    id: tournamentId,
    metaGame: tournament.metaGame ?? '',
    variants: Array.isArray(tournament.variants) ? [...tournament.variants] : [],
    number: tournament.number ?? 0,
    matchLegs,
    dateStarted: tournament.dateStarted,
    divisions: tournament.divisions ?? {},
    players,
  };
}

export async function resolveCurrentTournamentsForDashboard(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<DashboardCurrentTournament[]> {
  const refs = await listCurrentTournamentRefsForUser(client, tableName, userId);
  if (refs.length === 0) {
    return [];
  }
  const tournamentIds = refs.map(r => r.tournamentId);
  const tournaments = await loadTournamentsById(client, tableName, tournamentIds);
  const activeIds = tournamentIds.filter((id) => {
    const t = tournaments.get(id);
    if (t === undefined) {
      return false;
    }
    if (t.dateEnded !== undefined && t.dateEnded !== null) {
      return false;
    }
    if (t.started !== true) {
      return false;
    }
    return true;
  });
  const result: DashboardCurrentTournament[] = [];
  for (const tournamentId of activeIds) {
    const tournament = tournaments.get(tournamentId)!;
    const players = await listAssignedPlayerIds(client, tableName, tournamentId);
    result.push(toDashboardTournament(tournamentId, tournament, players));
  }
  return result;
}
