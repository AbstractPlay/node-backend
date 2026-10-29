import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { arenaIndexPk } from './keys.js';
import type { ArenaTableIndexState } from './constants.js';
import type { ArenaTableListItem } from './types.js';

const INDEX_STATES: ArenaTableIndexState[] = ['waiting', 'seated', 'playing'];

function rowToListItem(
  row: Record<string, unknown>,
  state: ArenaTableIndexState,
): ArenaTableListItem {
  return {
    tableId: String(row.tableId),
    metaGame: String(row.metaGame),
    variants: Array.isArray(row.variants) ? row.variants.map(String) : [],
    arenaTcId: String(row.arenaTcId),
    open: row.open !== false,
    hostId: String(row.hostId),
    ...(row.inviteUserId ? { inviteUserId: String(row.inviteUserId) } : {}),
    seatUserIds: Array.isArray(row.seatUserIds) ? row.seatUserIds.map(String) : [],
    updatedAt: Number(row.updatedAt),
    gameStartedAt: row.gameStartedAt !== undefined ? Number(row.gameStartedAt) : undefined,
    state,
  };
}

export async function listArenaTablesFromIndex(
  client: DynamoDBDocumentClient,
  tableName: string,
  opts: { metaGame?: string; limit?: number },
): Promise<{ tables: ArenaTableListItem[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const perPartition = Math.ceil(limit / INDEX_STATES.length);
  const tables: ArenaTableListItem[] = [];

  await Promise.all(INDEX_STATES.map(async (state) => {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': arenaIndexPk(state) },
      Limit: perPartition,
      ScanIndexForward: true,
    }));
    for (const row of result.Items ?? []) {
      const item = rowToListItem(row as Record<string, unknown>, state);
      if (opts.metaGame !== undefined && item.metaGame !== opts.metaGame) {
        continue;
      }
      tables.push(item);
    }
  }));

  tables.sort((a, b) => b.updatedAt - a.updatedAt);
  return { tables: tables.slice(0, limit) };
}
