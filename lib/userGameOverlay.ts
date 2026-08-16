import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export type UserGameOverlay = {
  seen?: number;
  lastChat?: number;
};

export type OverlayGameFields = {
  seen?: number;
  lastChat?: number;
};

async function queryOverlayRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
) {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': `USERGAME#${userId}` },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of page.Items ?? []) {
      items.push(item);
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

export async function listUserGameOverlays(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<Map<string, UserGameOverlay>> {
  const rows = await queryOverlayRows(client, tableName, userId);
  const overlays = new Map<string, UserGameOverlay>();

  for (const row of rows) {
    const gameId = row.sk as string;
    if (!gameId) {
      continue;
    }
    const overlay: UserGameOverlay = {};
    if (row.seen !== undefined) {
      overlay.seen = row.seen as number;
    }
    if (row.lastChat !== undefined) {
      overlay.lastChat = row.lastChat as number;
    }
    overlays.set(gameId, overlay);
  }

  return overlays;
}

export async function upsertUserGameOverlay(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
  fields: UserGameOverlay,
): Promise<void> {
  const parts: string[] = [];
  const values: Record<string, number> = {};

  if (fields.seen !== undefined) {
    parts.push('seen = :seen');
    values[':seen'] = fields.seen;
  }
  if (fields.lastChat !== undefined) {
    parts.push('lastChat = :lc');
    values[':lc'] = fields.lastChat;
  }
  if (parts.length === 0) {
    return;
  }

  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: `USERGAME#${userId}`, sk: gameId },
    UpdateExpression: `SET ${parts.join(', ')}`,
    ExpressionAttributeValues: values,
  }));
}

export async function deleteUserGameOverlay(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  gameId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: `USERGAME#${userId}`, sk: gameId },
  }));
}

export function applyOverlayFields<T extends OverlayGameFields>(
  game: T,
  overlay: UserGameOverlay | undefined,
  legacy?: OverlayGameFields,
): T {
  const seen = overlay?.seen ?? legacy?.seen;
  const lastChat = overlay?.lastChat ?? legacy?.lastChat;
  const result = { ...game };
  if (seen !== undefined) {
    result.seen = seen;
  } else {
    delete result.seen;
  }
  if (lastChat !== undefined) {
    result.lastChat = lastChat;
  } else {
    delete result.lastChat;
  }
  return result;
}

/** Strip overlay fields before persisting USER.games[] (Phase 4a: USERGAME# is sole overlay store). */
export function stripOverlayFields<T extends OverlayGameFields>(game: T): T {
  const result = { ...game };
  delete result.seen;
  delete result.lastChat;
  return result;
}

export function stripOverlayFieldsFromGames<T extends OverlayGameFields>(games: T[]): T[] {
  return games.map(game => stripOverlayFields(game));
}
