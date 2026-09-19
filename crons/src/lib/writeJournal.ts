import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export type DynamoItem = Record<string, unknown>;

export type RollbackEntry =
  | { op: 'delete'; pk: string; sk: string }
  | { op: 'put'; item: DynamoItem };

export class WriteJournal {
  private readonly entries: RollbackEntry[] = [];

  /** Record that rollback should delete a row created during this attempt. */
  trackCreate(pk: string, sk: string): void {
    this.entries.push({ op: 'delete', pk, sk });
  }

  /** Before overwrite/delete, snapshot prior row for rollback (or delete if absent). */
  trackReplace(previous: DynamoItem | undefined, pk: string, sk: string): void {
    if (previous !== undefined) {
      this.entries.push({ op: 'put', item: { ...previous } });
    } else {
      this.entries.push({ op: 'delete', pk, sk });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  async rollback(
    client: DynamoDBDocumentClient,
    tableName: string,
    send: (command: DeleteCommand | PutCommand) => Promise<unknown>,
  ): Promise<void> {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      try {
        if (entry.op === 'delete') {
          await send(new DeleteCommand({
            TableName: tableName,
            Key: { pk: entry.pk, sk: entry.sk },
          }));
        } else {
          await send(new PutCommand({
            TableName: tableName,
            Item: entry.item,
          }));
        }
      } catch (err) {
        console.error(`Rollback failed for ${entry.op} on ${entry.op === 'delete' ? `${entry.pk}/${entry.sk}` : entry.item.pk}/${entry.item.sk}:`, err);
      }
    }
  }
}

export async function loadItem(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  sk: string,
): Promise<DynamoItem | undefined> {
  const data = await client.send(new GetCommand({
    TableName: tableName,
    Key: { pk, sk },
  }));
  return data.Item as DynamoItem | undefined;
}

export async function acquireTournamentStartingLock(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  send: (command: UpdateCommand) => Promise<unknown>,
): Promise<boolean> {
  try {
    await send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'TOURNAMENT', sk: tournamentId },
      ConditionExpression: 'started = :f AND attribute_not_exists(starting)',
      UpdateExpression: 'SET starting = :t, startAttemptAt = :now',
      ExpressionAttributeValues: { ':f': false, ':t': true, ':now': Date.now() },
    }));
    return true;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      console.log(`Tournament ${tournamentId} is already starting or started`);
      return false;
    }
    throw err;
  }
}

export async function releaseTournamentStartingLock(
  client: DynamoDBDocumentClient,
  tableName: string,
  tournamentId: string,
  send: (command: UpdateCommand) => Promise<unknown>,
): Promise<void> {
  try {
    await send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: 'TOURNAMENT', sk: tournamentId },
      UpdateExpression: 'REMOVE starting, startAttemptAt',
    }));
  } catch (err) {
    console.error(`Failed to release starting lock on tournament ${tournamentId}:`, err);
  }
}
