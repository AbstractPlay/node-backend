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
      });
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return found;
}

export async function ensureTournamentGameLink(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  division: number,
  gameId: string,
  player1: string,
  player2: string,
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
    },
  }));
  return true;
}

export function existingPairKeys(games: ExistingTournamentGame[]): Set<string> {
  return new Set(games.map(g => g.pairKey));
}

export function findExistingGameForPair(
  games: ExistingTournamentGame[],
  pairKey: string,
): ExistingTournamentGame | undefined {
  return games.find(g => g.pairKey === pairKey);
}
