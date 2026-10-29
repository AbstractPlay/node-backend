import {
  DeleteCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { ArenaTableIndexState } from './constants.js';
import { arenaIndexPk, arenaIndexSk } from './keys.js';
import type { ArenaTableRecord } from './types.js';

export function indexStateForTable(table: ArenaTableRecord): ArenaTableIndexState {
  if (table.state === 'playing' || table.state === 'launching') {
    return 'playing';
  }
  const seated = table.seats.filter((s) => s.userId).length;
  if (seated >= 2) {
    return 'seated';
  }
  return 'waiting';
}

export function indexItemFromTable(table: ArenaTableRecord): Record<string, unknown> {
  const state = indexStateForTable(table);
  return {
    pk: arenaIndexPk(state),
    sk: arenaIndexSk(table.updatedAt, table.tableId),
    tableId: table.tableId,
    metaGame: table.metaGame,
    variants: table.variants,
    arenaTcId: table.arenaTcId,
    open: table.open,
    hostId: table.hostId,
    ...(table.inviteUserId ? { inviteUserId: table.inviteUserId } : {}),
    seatUserIds: table.seats.map((s) => s.userId).filter(Boolean),
    updatedAt: table.updatedAt,
    ...(table.gameStartedAt !== undefined ? { gameStartedAt: table.gameStartedAt } : {}),
  };
}

export async function putArenaIndexRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  table: ArenaTableRecord,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: indexItemFromTable(table),
  }));
}

export async function deleteArenaIndexRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  indexState: ArenaTableIndexState,
  updatedAt: number,
  tableId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: {
      pk: arenaIndexPk(indexState),
      sk: arenaIndexSk(updatedAt, tableId),
    },
  }));
}

export async function syncArenaIndexOnTableWrite(
  client: DynamoDBDocumentClient,
  tableName: string,
  prev: ArenaTableRecord | null,
  next: ArenaTableRecord,
): Promise<void> {
  if (prev !== null && prev.indexState !== next.indexState) {
    await deleteArenaIndexRow(
      client,
      tableName,
      prev.indexState,
      prev.updatedAt,
      prev.tableId,
    );
  } else if (prev !== null && prev.indexState === next.indexState && prev.updatedAt !== next.updatedAt) {
    await deleteArenaIndexRow(
      client,
      tableName,
      prev.indexState,
      prev.updatedAt,
      prev.tableId,
    );
  }
  if (next.state !== 'abandoned' && next.state !== 'ended') {
    await putArenaIndexRow(client, tableName, next);
  }
}

export async function deleteAllArenaIndexForTable(
  client: DynamoDBDocumentClient,
  tableName: string,
  table: ArenaTableRecord,
): Promise<void> {
  await deleteArenaIndexRow(
    client,
    tableName,
    table.indexState,
    table.updatedAt,
    table.tableId,
  );
}
