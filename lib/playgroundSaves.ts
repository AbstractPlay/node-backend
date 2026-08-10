import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  hydratePlaygroundBody,
  preparePlaygroundBodyForStorage,
} from './gameState';

export type PlaygroundSaveRecord = {
  pk: string;
  sk: string;
  id: string;
  name: string;
  metaGame: string;
  date: number;
  body: string;
};

export type PlaygroundSaveSummary = {
  id: string;
  name: string;
  metaGame: string;
  date: number;
};

export type PlaygroundSaveInput = {
  name: string;
  metaGame: string;
  date: number | string;
  body: string;
};

export type PlaygroundSaveValidationResult =
  | { ok: true; data: { name: string; metaGame: string; date: number; body: string } }
  | { ok: false; message: string };

export function playgroundPk(userId: string): string {
  return `PLAYGROUND#${userId}`;
}

export function validatePlaygroundSaveInput(pars: PlaygroundSaveInput): PlaygroundSaveValidationResult {
  if (typeof pars.name !== 'string' || pars.name.trim() === '') {
    return { ok: false, message: 'name is required.' };
  }
  if (typeof pars.metaGame !== 'string' || pars.metaGame.trim() === '') {
    return { ok: false, message: 'metaGame is required.' };
  }
  if (typeof pars.body !== 'string') {
    return { ok: false, message: 'body must be a string.' };
  }
  try {
    JSON.parse(pars.body);
  } catch {
    return { ok: false, message: 'body must be valid JSON.' };
  }
  const dateMs = new Date(pars.date).getTime();
  if (Number.isNaN(dateMs)) {
    return { ok: false, message: 'date is invalid.' };
  }
  return {
    ok: true,
    data: {
      name: pars.name.trim(),
      metaGame: pars.metaGame.trim(),
      date: dateMs,
      body: pars.body,
    },
  };
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

export async function listPlaygroundSaves(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<PlaygroundSaveSummary[]> {
  const items = await queryAllItems(client, {
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk', '#id': 'id', '#name': 'name', '#metaGame': 'metaGame', '#date': 'date' },
    ExpressionAttributeValues: { ':pk': playgroundPk(userId) },
    ProjectionExpression: '#id, #name, #metaGame, #date',
  });
  return items.map(item => ({
    id: item.id as string,
    name: item.name as string,
    metaGame: item.metaGame as string,
    date: item.date as number,
  }));
}

export async function getPlaygroundSave(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  id: string,
): Promise<PlaygroundSaveRecord | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: playgroundPk(userId), sk: id },
  }));
  if (data.Item === undefined) {
    return undefined;
  }
  return hydratePlaygroundBody(data.Item as PlaygroundSaveRecord);
}

export async function putPlaygroundSave(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  id: string,
  fields: { name: string; metaGame: string; date: number; body: string },
): Promise<PlaygroundSaveRecord> {
  const record: PlaygroundSaveRecord = {
    pk: playgroundPk(userId),
    sk: id,
    id,
    name: fields.name,
    metaGame: fields.metaGame,
    date: fields.date,
    body: fields.body,
  };
  const stored = preparePlaygroundBodyForStorage(record);
  await client.send(new PutCommand({
    TableName: tableName,
    Item: stored,
  }));
  return record;
}

export async function deletePlaygroundSave(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  id: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: playgroundPk(userId), sk: id },
  }));
}
