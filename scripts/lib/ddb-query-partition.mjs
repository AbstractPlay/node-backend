import { QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Paginated Query on a single-table partition (`pk`).
 *
 * @param {import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient} docClient
 * @param {string} tableName
 * @param {string} pk
 * @param {{
 *   filterExpression?: string,
 *   expressionAttributeNames?: Record<string, string>,
 *   expressionAttributeValues?: Record<string, unknown>,
 *   projectionExpression?: string,
 *   onPage?: (items: Record<string, unknown>[]) => void,
 *   includeItem?: (item: Record<string, unknown>) => boolean,
 *   maxItems?: number,
 * }} [opts]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function queryPartitionItems(docClient, tableName, pk, opts = {}) {
  const items = [];
  let lastEvaluatedKey;
  const includeItem = opts.includeItem ?? (() => true);

  const expressionAttributeNames = {
    '#pk': 'pk',
    ...opts.expressionAttributeNames,
  };
  const expressionAttributeValues = {
    ':pk': pk,
    ...opts.expressionAttributeValues,
  };

  do {
    /** @type {import('@aws-sdk/lib-dynamodb').QueryCommandInput} */
    const input = {
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ExclusiveStartKey: lastEvaluatedKey,
    };
    if (opts.filterExpression !== undefined) {
      input.FilterExpression = opts.filterExpression;
    }
    if (opts.projectionExpression !== undefined) {
      input.ProjectionExpression = opts.projectionExpression;
    }

    const page = await docClient.send(new QueryCommand(input));
    const pageItems = page.Items ?? [];
    if (opts.onPage !== undefined) {
      opts.onPage(pageItems);
    }
    for (const item of pageItems) {
      if (!includeItem(item)) {
        continue;
      }
      items.push(item);
      if (opts.maxItems !== undefined && items.length >= opts.maxItems) {
        return items;
      }
    }
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}