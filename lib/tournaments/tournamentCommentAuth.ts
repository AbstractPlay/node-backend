import {
  GetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { isSiteAdmin } from '../commentAuth.js';

export type TournamentCommentAuthResult =
  | { ok: true }
  | { ok: false; message: string };

type TournamentPlayerRow = { playerid?: string; sk?: string };

type CompletedTournament = {
  players?: TournamentPlayerRow[];
};

function playerIdFromRow(row: TournamentPlayerRow): string | undefined {
  if (row.playerid !== undefined && row.playerid !== '') {
    return row.playerid;
  }
  const sk = row.sk;
  if (sk === undefined) {
    return undefined;
  }
  const parts = sk.split('#');
  return parts[parts.length - 1];
}

export async function listTournamentParticipantIds(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  metaGame?: string,
): Promise<string[]> {
  const playerRows = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': 'TOURNAMENTPLAYER',
        ':sk': `${tournamentId}#`,
      },
    }),
  );
  const fromIndex = (playerRows.Items as TournamentPlayerRow[] | undefined ?? [])
    .map(playerIdFromRow)
    .filter((id): id is string => id !== undefined && id !== '');
  if (fromIndex.length > 0) {
    return [...new Set(fromIndex)];
  }

  let completed: CompletedTournament | undefined;
  if (metaGame !== undefined && metaGame !== '' && metaGame !== 'undefined') {
    const data = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          pk: 'COMPLETEDTOURNAMENT',
          sk: `${metaGame}#${tournamentId}`,
        },
      }),
    );
    completed = data.Item as CompletedTournament | undefined;
  } else {
    const data = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk',
        FilterExpression: 'ends_with(#sk, :suffix)',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ExpressionAttributeValues: {
          ':pk': 'COMPLETEDTOURNAMENT',
          ':suffix': `#${tournamentId}`,
        },
      }),
    );
    completed = data.Items?.[0] as CompletedTournament | undefined;
  }

  const fromArchive = (completed?.players ?? [])
    .map(playerIdFromRow)
    .filter((id): id is string => id !== undefined && id !== '');
  return [...new Set(fromArchive)];
}

export function isTournamentParticipant(
  participantIds: readonly string[],
  userid: string,
): boolean {
  return participantIds.includes(userid);
}

export type TournamentChatPlayer = { id: string; name: string };

export async function listTournamentChatPlayers(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  metaGame?: string,
): Promise<TournamentChatPlayer[]> {
  const playerRows = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: {
        ':pk': 'TOURNAMENTPLAYER',
        ':sk': `${tournamentId}#`,
      },
    }),
  );
  const fromIndex = (playerRows.Items as TournamentPlayerRow[] | undefined ?? [])
    .map((row) => {
      const id = playerIdFromRow(row);
      if (id === undefined || id === '') {
        return undefined;
      }
      const name = (row as { playername?: string }).playername ?? 'Someone';
      return { id, name };
    })
    .filter((p): p is TournamentChatPlayer => p !== undefined);
  if (fromIndex.length > 0) {
    const byId = new Map<string, TournamentChatPlayer>();
    for (const p of fromIndex) {
      byId.set(p.id, p);
    }
    return [...byId.values()];
  }

  let completed: CompletedTournament | undefined;
  if (metaGame !== undefined && metaGame !== '' && metaGame !== 'undefined') {
    const data = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          pk: 'COMPLETEDTOURNAMENT',
          sk: `${metaGame}#${tournamentId}`,
        },
      }),
    );
    completed = data.Item as CompletedTournament | undefined;
  } else {
    const data = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: '#pk = :pk',
        FilterExpression: 'ends_with(#sk, :suffix)',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
        ExpressionAttributeValues: {
          ':pk': 'COMPLETEDTOURNAMENT',
          ':suffix': `#${tournamentId}`,
        },
      }),
    );
    completed = data.Items?.[0] as CompletedTournament | undefined;
  }

  const fromArchive = (completed?.players ?? [])
    .map((row) => {
      const id = playerIdFromRow(row);
      if (id === undefined || id === '') {
        return undefined;
      }
      const name = (row as { playername?: string }).playername ?? 'Someone';
      return { id, name };
    })
    .filter((p): p is TournamentChatPlayer => p !== undefined);
  const byId = new Map<string, TournamentChatPlayer>();
  for (const p of fromArchive) {
    byId.set(p.id, p);
  }
  return [...byId.values()];
}

export async function checkTournamentCommentAuth(
  client: DynamoDBDocumentClient,
  tableName: string,
  userid: string,
  tournamentId: string,
  metaGame?: string,
): Promise<TournamentCommentAuthResult> {
  if (!userid) {
    return { ok: false, message: 'Authentication required.' };
  }

  if (await isSiteAdmin(client, tableName, userid)) {
    return { ok: true };
  }

  const participantIds = await listTournamentParticipantIds(
    client,
    tableName,
    tournamentId,
    metaGame,
  );
  if (isTournamentParticipant(participantIds, userid)) {
    return { ok: true };
  }

  const active = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'TOURNAMENT', sk: tournamentId },
    }),
  );
  if (active.Item === undefined && participantIds.length === 0) {
    return { ok: false, message: 'Tournament not found.' };
  }

  return {
    ok: false,
    message: 'Only tournament participants and admins can post tournament chat.',
  };
}
