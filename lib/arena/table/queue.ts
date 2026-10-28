import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { arenaQueuePk, arenaQueueSk } from './keys.js';
import {
  assertArenaTcId,
  assertMetaGameArenaEligible,
  assertUserFreeForArenaTable,
} from './eligibility.js';
import { createArenaTableRecord, joinArenaTableRecord } from './tableMutations.js';

export async function leaveArenaQueueRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  pars: { metaGame: string; arenaTcId: string; variants?: string[] },
): Promise<void> {
  const pk = arenaQueuePk(pars.metaGame, pars.arenaTcId, pars.variants ?? []);
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk, sk: arenaQueueSk(userId) },
  }));
}

async function listQueueWaiters(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<string[]> {
  const result = await client.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':pk': pk },
  }));
  return (result.Items ?? []).map((row) => String(row.sk));
}

export async function joinArenaQueueRecord(
  client: DynamoDBDocumentClient,
  tableName: string,
  userId: string,
  pars: { metaGame: string; arenaTcId: string; variants?: string[] },
): Promise<
  | { ok: true; matched: false }
  | { ok: true; matched: true; tableId: string }
  | { error: string }
> {
  const metaCheck = assertMetaGameArenaEligible(pars.metaGame);
  if (!metaCheck.ok) {
    return { error: metaCheck.message };
  }
  const tcCheck = assertArenaTcId(pars.arenaTcId);
  if (!tcCheck.ok) {
    return { error: tcCheck.message };
  }
  const free = await assertUserFreeForArenaTable(client, tableName, userId);
  if (!free.ok) {
    return { error: free.message };
  }

  const pk = arenaQueuePk(pars.metaGame, pars.arenaTcId, pars.variants ?? []);
  const waiters = await listQueueWaiters(client, tableName, pk);
  const opponent = waiters.find((id) => id !== userId);

  if (opponent === undefined) {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk,
        sk: arenaQueueSk(userId),
        userId,
        queuedAt: Date.now(),
        metaGame: pars.metaGame,
        arenaTcId: pars.arenaTcId,
        variants: pars.variants ?? [],
      },
    }));
    return { ok: true, matched: false };
  }

  await leaveArenaQueueRecord(client, tableName, opponent, pars);
  await leaveArenaQueueRecord(client, tableName, userId, pars).catch(() => undefined);

  const hostId = userId < opponent ? userId : opponent;
  const guestId = hostId === userId ? opponent : userId;
  const created = await createArenaTableRecord(client, tableName, hostId, {
    metaGame: pars.metaGame,
    arenaTcId: pars.arenaTcId,
    variants: pars.variants,
    open: true,
  });
  if ('error' in created) {
    return { error: created.error };
  }
  const joined = await joinArenaTableRecord(client, tableName, guestId, created.tableId);
  if ('error' in joined) {
    return { error: joined.error };
  }
  return { ok: true, matched: true, tableId: created.tableId };
}