import { DeleteCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export async function createArenaTableCommentsRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  tableId: string,
): Promise<void> {
  await client.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: 'GAMECOMMENTS',
      sk: tableId,
      comments: [],
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function deleteArenaTableCommentsRow(
  client: DynamoDBDocumentClient,
  tableName: string,
  tableId: string,
): Promise<void> {
  await client.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk: 'GAMECOMMENTS', sk: tableId },
  }));
}
