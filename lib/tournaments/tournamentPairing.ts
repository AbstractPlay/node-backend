import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

export function canonicalPlayerPair(player1: string, player2: string): string {
  return [player1, player2].sort((a, b) => a.localeCompare(b)).join('#');
}

export type ExistingTournamentGame = {
  id: string;
  division: number;
  player1: string;
  player2: string;
  pairKey: string;
  matchLeg?: number;
};

export async function loadExistingTournamentGames(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
): Promise<ExistingTournamentGame[]> {
  const found: ExistingTournamentGame[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      FilterExpression: '#t = :tid',
      ExpressionAttributeNames: { '#pk': 'pk', '#t': 'tournament' },
      ExpressionAttributeValues: { ':pk': 'GAME', ':tid': tournamentId },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      const game = item as {
        id: string;
        division?: number;
        players?: { id: string }[];
        matchLeg?: number;
      };
      if (game.players === undefined || game.players.length < 2) {
        continue;
      }
      const player1 = game.players[0]!.id;
      const player2 = game.players[1]!.id;
      found.push({
        id: game.id,
        division: game.division ?? 1,
        player1,
        player2,
        pairKey: canonicalPlayerPair(player1, player2),
        matchLeg: game.matchLeg,
      });
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return found;
}

export type TournamentGameLinkFields = {
  matchLeg?: number;
  rematchOf?: string;
};

export async function ensureTournamentGameLink(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  division: number,
  gameId: string,
  player1: string,
  player2: string,
  extra?: TournamentGameLinkFields,
): Promise<boolean> {
  const sk = `${tournamentId}#${division.toString()}#${gameId}`;
  const existing = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: 'TOURNAMENTGAME', sk },
    ProjectionExpression: '#pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
  }));
  if (existing.Item !== undefined) {
    return false;
  }
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: 'TOURNAMENTGAME',
      sk,
      id: gameId,
      player1,
      player2,
      ...extra,
    },
  }));
  return true;
}

export function pairingResumeKey(pairKey: string, matchLeg: number): string {
  return `${pairKey}#${matchLeg.toString()}`;
}

/** Leg-1 pair keys present in an existing tournament (resume backfill). */
export function existingLeg1PairKeys(games: ExistingTournamentGame[]): Set<string> {
  const keys = new Set<string>();
  for (const g of games) {
    const leg = g.matchLeg ?? 1;
    if (leg === 1) {
      keys.add(g.pairKey);
    }
  }
  return keys;
}

export function findExistingGameForPair(
  games: ExistingTournamentGame[],
  pairKey: string,
  matchLeg = 1,
): ExistingTournamentGame | undefined {
  return games.find(g =>
    g.pairKey === pairKey && (g.matchLeg ?? 1) === matchLeg);
}

export async function tournamentLeg2ExistsForPair(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  division: number,
  player1: string,
  player2: string,
): Promise<boolean> {
  const pairKey = canonicalPlayerPair(player1, player2);
  const prefix = `${tournamentId}#${division.toString()}#`;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': 'TOURNAMENTGAME', ':sk': prefix },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      const row = item as {
        player1: string;
        player2: string;
        matchLeg?: number;
      };
      if (row.matchLeg !== 2) {
        continue;
      }
      if (canonicalPlayerPair(row.player1, row.player2) === pairKey) {
        return true;
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return false;
}
