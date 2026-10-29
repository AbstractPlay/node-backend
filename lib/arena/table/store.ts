import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ARENA_TABLE_PK, ARENA_USER_PK } from './constants.js';
import { arenaTableSk, arenaUserSk } from './keys.js';
import type { ArenaTableRecord } from './types.js';

export async function getArenaTable(
  client: DynamoDBDocumentClient,
  tableName: string,
  tableId: string,
): Promise<ArenaTableRecord | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ARENA_TABLE_PK, sk: arenaTableSk(tableId) },
  }));
  if (data.Item === undefined) {
    return undefined;
  }
  return data.Item as ArenaTableRecord;
}

export async function putArenaTable(
  client: DynamoDBDocumentClient,
  tableName: string,
  table: ArenaTableRecord,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: table,
  }));
}

export async function deleteArenaTable(
  client: DynamoDBDocumentClient,
  tableName: string,
  tableId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: ARENA_TABLE_PK, sk: arenaTableSk(tableId) },
  }));
}

export async function getArenaUserTableId(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<string | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk: ARENA_USER_PK, sk: arenaUserSk(userId) },
  }));
  const row = data.Item as { tableId?: string } | undefined;
  return row?.tableId;
}

export async function putArenaUserSlot(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  tableId: string,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: ARENA_USER_PK,
      sk: arenaUserSk(userId),
      tableId,
      updatedAt: Date.now(),
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function deleteArenaUserSlot(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: ARENA_USER_PK, sk: arenaUserSk(userId) },
  }));
}
