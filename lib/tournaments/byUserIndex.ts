import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

export type CurrentTournamentRef = {
  tournamentId: string;
  division?: number;
  metaGame?: string;
};

export type PutCurrentTournamentForUserInput = {
  userId: string;
  tournamentId: string;
  division?: number;
  metaGame?: string;
};

export function tournamentByUserPk(userId: string): string {
  return `TOURNAMENTBYUSER#${userId}`;
}

export function tournamentByUserSk(tournamentId: string): string {
  return tournamentId;
}

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

export async function putCurrentTournamentForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  input: PutCurrentTournamentForUserInput,
): Promise<void> {
  const { userId, tournamentId, division, metaGame } = input;
  const item: Record<string, unknown> = {
    pk: tournamentByUserPk(userId),
    sk: tournamentByUserSk(tournamentId),
  };
  if (division !== undefined) {
    item.division = division;
  }
  if (metaGame !== undefined) {
    item.metaGame = metaGame;
  }
  await client.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));
}

export async function deleteTournamentForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tournamentId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: {
      pk: tournamentByUserPk(userId),
      sk: tournamentByUserSk(tournamentId),
    },
  }));
}

export async function listCurrentTournamentRefsForUser(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<CurrentTournamentRef[]> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': tournamentByUserPk(userId) },
  });
  return items.map((item) => {
    const ref: CurrentTournamentRef = {
      tournamentId: String(item.sk),
    };
    if (item.division !== undefined && item.division !== null) {
      ref.division = Number(item.division);
    }
    if (typeof item.metaGame === 'string') {
      ref.metaGame = item.metaGame;
    }
    return ref;
  });
}
